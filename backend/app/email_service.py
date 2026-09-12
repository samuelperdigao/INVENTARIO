"""Entrega reutilizável de mensagens transacionais e relatórios."""

from __future__ import annotations

from dataclasses import dataclass
from email.message import EmailMessage
import logging
import smtplib
import ssl

from app.config import Settings


logger = logging.getLogger("inventory.email")


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
# de produção recusa inicialização sem SMTP e nunca grava mensagens aqui.
development_outbox: list[DeliveredEmail] = []


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
