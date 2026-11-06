import { describe, it, expect } from "vitest";

function compileDeliveryNotes(params: {
  recipientName?: string;
  destinationType?: string;
  detectedCategory?: { label: string; badge?: string } | null;
  observation?: string;
  additionalNotes?: string;
}): string {
  const notesParts: string[] = [];
  if (params.recipientName?.trim()) {
    notesParts.push(`Destinatário: ${params.recipientName.trim()}`);
  }
  if (params.destinationType) {
    notesParts.push(`Tipo: ${params.destinationType}`);
  }
  if (
    params.detectedCategory?.badge &&
    !params.destinationType?.toLowerCase().includes(params.detectedCategory.badge.toLowerCase())
  ) {
    notesParts.push(`Local: ${params.detectedCategory.label}`);
  }
  if (params.observation?.trim()) {
    notesParts.push(`Obs: ${params.observation.trim()}`);
  }
  if (params.additionalNotes?.trim()) {
    notesParts.push(`Obs adicional: ${params.additionalNotes.trim()}`);
  }
  return notesParts.join(" • ");
}

describe("Store & Driver Order Notes Pipeline", () => {
  it("should compile all note parts including additionalNotes and observation", () => {
    const notes = compileDeliveryNotes({
      recipientName: "Maria Silva",
      destinationType: "Apartamento / Condomínio",
      detectedCategory: { label: "Condomínio Residencial", badge: "Condomínio" },
      observation: "Apto 302 Bloco B",
      additionalNotes: "Tocar interfone 302, se não atender ligar no celular",
    });

    expect(notes).toContain("Destinatário: Maria Silva");
    expect(notes).toContain("Tipo: Apartamento / Condomínio");
    expect(notes).toContain("Obs: Apto 302 Bloco B");
    expect(notes).toContain("Obs adicional: Tocar interfone 302, se não atender ligar no celular");
  });

  it("should preserve additionalNotes even when observation is omitted", () => {
    const notes = compileDeliveryNotes({
      recipientName: "João",
      destinationType: "Casa / Residência",
      observation: "",
      additionalNotes: "Cuidado com o cachorro no portão",
    });

    expect(notes).toContain("Destinatário: João");
    expect(notes).toContain("Tipo: Casa / Residência");
    expect(notes).toContain("Obs adicional: Cuidado com o cachorro no portão");
    expect(notes).not.toContain("Obs: ");
  });

  it("should handle empty or whitespace-only notes without creating phantom bullets", () => {
    const notes = compileDeliveryNotes({
      recipientName: "",
      destinationType: "",
      observation: "   ",
      additionalNotes: "   ",
    });

    expect(notes).toBe("");
  });

  it("should format notification snippets cleanly when notes exist", () => {
    const compiled = compileDeliveryNotes({
      recipientName: "Carlos",
      observation: "Portão lateral",
      additionalNotes: "Deixar com o vizinho se não estiver",
    });

    const feeText = " no valor de R$ 8.50";
    const notificationContent = `Novo chamado de entrega disponível${feeText}.${compiled ? ` Obs: ${compiled.slice(0, 80)}` : ""} Toque para abrir e aceitar.`;

    expect(notificationContent).toContain("Obs: Destinatário: Carlos • Obs: Portão lateral");
    expect(notificationContent).toContain("Toque para abrir e aceitar.");
  });
});

