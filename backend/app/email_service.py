"""Entrega reutilizável de mensagens transacionais e relatórios."""

from __future__ import annotations

import base64
from dataclasses import dataclass
from email.message import EmailMessage
import logging
import smtplib
import ssl

import httpx

from app.config import Settings


logger = logging.getLogger("uvicorn.error")
SMTP2GO_ENDPOINT = "https://api.smtp2go.com/v3/email/send"


@dataclass(frozen=True)
class EmailAttachment:
    filename: str
    content: bytes
    maintype: str
    subtype: str


@dataclass(frozen=True)
class DeliveredEmail:
    recipient: str
    subject: str
    text: str
    attachment_names: tuple[str, ...]


# Caixa de saída estritamente local, útil para desenvolvimento e testes. O modo
# de produção nunca grava mensagens aqui.
development_outbox: list[DeliveredEmail] = []


def _send_via_smtp2go(
    settings: Settings,
    *,
    recipient: str,
    subject: str,
    text: str,
    attachments: tuple[EmailAttachment, ...],
) -> None:
    if not settings.smtp2go_api_key or not settings.smtp_from_email:
        raise RuntimeError("SMTP2GO não configurado.")

    payload: dict[str, object] = {
        "sender": f"INVENTARIO <{settings.smtp_from_email}>",
        "to": [recipient],
        "subject": subject,
        "text_body": text,
        "fastaccept": True,
    }
    if attachments:
        payload["attachments"] = [
            {
                "filename": item.filename,
                "fileblob": base64.b64encode(item.content).decode("ascii"),
                "mimetype": f"{item.maintype}/{item.subtype}",
            }
            for item in attachments
        ]

    try:
        response = httpx.post(
            SMTP2GO_ENDPOINT,
            headers={
                "Content-Type": "application/json",
                "Accept": "application/json",
                "X-Smtp2go-Api-Key": settings.smtp2go_api_key,
            },
            json=payload,
            timeout=20.0,
        )
        response.raise_for_status()
        data = response.json().get("data", {})
        if int(data.get("failed", 0)) > 0:
            logger.error("SMTP2GO recusou o envio. failed=%s", data.get("failed"))
            raise RuntimeError("SMTP2GO recusou o envio.")
    except httpx.HTTPStatusError as error:
        logger.error("Falha HTTP no SMTP2GO. status=%s", error.response.status_code)
        raise RuntimeError("Falha no provedor de e-mail.") from error
    except (httpx.HTTPError, ValueError, TypeError) as error:
        logger.error("Falha de comunicação com SMTP2GO. type=%s", type(error).__name__)
        raise RuntimeError("Falha no provedor de e-mail.") from error


def send_email(
    settings: Settings,
    *,
    recipient: str,
    subject: str,
    text: str,
    attachments: tuple[EmailAttachment, ...] = (),
) -> None:
    if settings.email_mode == "console":
        development_outbox.append(
            DeliveredEmail(recipient, subject, text, tuple(item.filename for item in attachments))
        )
        logger.warning("E-mail de desenvolvimento destinado a %s: %s\n%s", recipient, subject, text)
        return

    if settings.email_mode == "smtp2go":
        _send_via_smtp2go(
            settings,
            recipient=recipient,
            subject=subject,
            text=text,
            attachments=attachments,
        )
        return

    if not settings.smtp_host or not settings.smtp_from_email:
        raise RuntimeError("Servidor SMTP ou remetente não configurado.")
    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = settings.smtp_from_email
    message["To"] = recipient
    message.set_content(text)
    for item in attachments:
        message.add_attachment(
            item.content,
            maintype=item.maintype,
            subtype=item.subtype,
            filename=item.filename,
        )

    if settings.smtp_security == "ssl":
        connection_context = smtplib.SMTP_SSL(
            settings.smtp_host, settings.smtp_port, timeout=20, context=ssl.create_default_context()
        )
    else:
        connection_context = smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=20)

    try:
        with connection_context as connection:
            if settings.smtp_security == "starttls":
                connection.starttls(context=ssl.create_default_context())
            if settings.smtp_username:
                connection.login(settings.smtp_username, settings.smtp_password or "")
            connection.send_message(message)
    except smtplib.SMTPAuthenticationError as error:
        logger.error("Falha de autenticação SMTP. smtp_code=%s", getattr(error, "smtp_code", "unknown"))
        raise
    except smtplib.SMTPException as error:
        logger.error(
            "Falha SMTP. type=%s smtp_code=%s",
            type(error).__name__,
            getattr(error, "smtp_code", "unknown"),
        )
        raise
    except OSError as error:
        logger.error("Falha de rede no SMTP. type=%s", type(error).__name__)
        raise
