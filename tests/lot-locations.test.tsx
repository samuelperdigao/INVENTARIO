import { render, screen, within } from "@testing-library/react";
import { expect, it } from "vitest";

import { formatLotLocation, LotLocations } from "@/components/lot-locations";
import type { AnalysisClassification, AnalysisLocation } from "@/lib/models";

function location(side: "EF" | "DE", bay: string, quantity: number): AnalysisLocation {
  return { side, bay, quantity };
}

function renderLocations(classification: AnalysisClassification, locations: AnalysisLocation[]) {
  render(<LotLocations classification={classification} locations={locations} />);
  return screen.getByRole("list", { name: "Locais do lote" });
}

it("formata OK com um local sem repetir quantidade", () => {
  expect(formatLotLocation(location("DE", "15", 20), "OK")).toBe("DE 15");

  const list = renderLocations("OK", [location("DE", "15", 20)]);
  expect(list).toHaveTextContent("DE 15");
  expect(list).not.toHaveTextContent("20");
  expect(list).not.toHaveTextContent("pç");
  expect(list).not.toHaveTextContent(/[()]/);
});

it("formata OK no lado EF sem repetir quantidade", () => {
  expect(formatLotLocation(location("EF", "3", 3), "OK")).toBe("EF 3");

  const list = renderLocations("OK", [location("EF", "3", 3)]);
  expect(within(list).getByRole("listitem", { name: "EF 3" })).toBeInTheDocument();
  expect(list).not.toHaveTextContent("3 pç");
});

it("mantém cada localização e sua quantidade em uma linha para peça solteira", () => {
  expect(formatLotLocation(location("EF", "15", 19), "PEÇA_SOLTEIRA")).toBe("EF 15 · 19 pç");

  const list = renderLocations("PEÇA_SOLTEIRA", [location("EF", "15", 19), location("DE", "21", 1)]);
  const rows = within(list).getAllByRole("listitem");
  expect(rows).toHaveLength(2);
  expect(rows.map((row) => row.getAttribute("aria-label"))).toEqual(["EF 15 · 19 pç", "DE 21 · 1 pç"]);
  expect(rows[0].querySelector(".lot-location-name")).toHaveTextContent("EF 15");
  expect(rows[0].querySelector(".lot-location-quantity")).toHaveTextContent("19 pç");
  expect(rows[1].querySelector(".lot-location-name")).toHaveTextContent("DE 21");
  expect(rows[1].querySelector(".lot-location-quantity")).toHaveTextContent("1 pç");
});

it("mantém quantidades para distribuição ambígua 10/10", () => {
  const list = renderLocations("DISTRIBUIÇÃO_AMBÍGUA", [location("EF", "10", 10), location("DE", "10", 10)]);
  expect(within(list).getAllByRole("listitem").map((row) => row.getAttribute("aria-label"))).toEqual([
    "EF 10 · 10 pç",
    "DE 10 · 10 pç",
  ]);
});

it("mantém quantidades para distribuição ambígua 11/9", () => {
  const list = renderLocations("DISTRIBUIÇÃO_AMBÍGUA", [location("EF", "11", 11), location("DE", "11", 9)]);
  expect(within(list).getAllByRole("listitem").map((row) => row.getAttribute("aria-label"))).toEqual([
    "EF 11 · 11 pç",
    "DE 11 · 9 pç",
  ]);
});

it("mantém todas as localizações do grupo deslocado", () => {
  const list = renderLocations("GRUPO_DESLOCADO", [
    location("EF", "12", 2),
    location("DE", "08", 15),
    location("DE", "20", 3),
  ]);
  expect(within(list).getAllByRole("listitem").map((row) => row.getAttribute("aria-label"))).toEqual([
    "EF 12 · 2 pç",
    "DE 08 · 15 pç",
    "DE 20 · 3 pç",
  ]);
});

it("renderiza grande quantidade de locais sem juntar linhas ou usar vírgulas", () => {
  const locations = Array.from({ length: 12 }, (_, index) => location(index % 2 === 0 ? "EF" : "DE", String(index + 1), index + 1));
  const list = renderLocations("GRUPO_DESLOCADO", locations);

  expect(within(list).getAllByRole("listitem")).toHaveLength(12);
  expect(list).not.toHaveTextContent(",");
  expect(list).not.toHaveTextContent(/[()]/);
});

it("preserva vãos de um e dois dígitos junto do lado", () => {
  const list = renderLocations("DISTRIBUIÇÃO_AMBÍGUA", [location("DE", "1", 8), location("EF", "10", 12)]);
  expect(within(list).getByRole("listitem", { name: "DE 1 · 8 pç" })).toBeInTheDocument();
  expect(within(list).getByRole("listitem", { name: "EF 10 · 12 pç" })).toBeInTheDocument();
});

it("mantém nome e quantidade em elementos não quebráveis para mobile", () => {
  const list = renderLocations("PEÇA_SOLTEIRA", [location("EF", "15", 19)]);
  const row = within(list).getByRole("listitem");

  expect(row).toHaveClass("lot-location");
  expect(row.querySelector(".lot-location-name")).toHaveClass("lot-location-name");
  expect(row.querySelector(".lot-location-quantity")).toHaveClass("lot-location-quantity");
  expect(row).toHaveAttribute("aria-label", "EF 15 · 19 pç");
});

it("não repete quantidade física para lotes OK mesmo com classificação sem acento visual", () => {
  const list = renderLocations("OK", [location("DE", "2", 999)]);

  expect(list).toHaveTextContent("DE 2");
  expect(list).not.toHaveTextContent("999");
  expect(list).not.toHaveTextContent("pç");
  expect(list).not.toHaveTextContent("(");
  expect(list).not.toHaveTextContent(")");
});
