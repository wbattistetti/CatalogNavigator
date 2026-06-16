# DialogEngine (VB.NET)

Motore deterministico del dialogo agente — estrazione concetti, filtraggio candidati, disambiguazione.

## Formato bundle (VB-native)

```json
{
  "meta": { "documentName": "..." },
  "ontology": {
    "startQuestion": "Come posso aiutarla?",
    "confirmationPreamble": "Confermo:",
    "categories": [
      {
        "id": "c1",
        "name": "specialità",
        "order": 0,
        "kind": "attributo",
        "allowedValues": ["cardiologica"],
        "grammar": {
          "regex": "(?<cardiologica>cardiologica|visita cardiologica)",
          "mappings": { "cardiologica": "cardiologica" }
        }
      }
    ],
    "nodes": [
      { "path": "cardiologica.adulto", "confirmationText": "Visita cardiologica adulta" }
    ]
  },
  "catalog": {
    "items": [
      {
        "path": "cardiologica.adulto",
        "concepts": [
          { "category": "specialità", "value": "cardiologica", "kind": "attributo" }
        ],
        "ageConstraints": [{ "categoryName": "fascia di età", "min": 18 }]
      }
    ]
  }
}
```

## Flusso turno

```
Utterance (testo o concept in ingresso)
         │
         ▼
  ConceptsFromUtterance (grammatiche su ontology.categories)
         │
         ▼
  Merge → ResolvedConcepts (conversation)
         │
         ▼
  FilterCandidates (catalog.Items, on/off per concetto accumulato)
         │
         ├── 0 candidati → no_match
         ├── chiedi età / disambigua / conferma
         └── ...
```

## Uso rapido

```vb
Imports DialogEngine

Dim result = AgentTurnEngine.ProcessAgentTurn(bundle, state, New AgentTurnInput With {
    .IncomingConcepts = New List(Of Concept) From {
        New Concept With {.Category = "specialità", .Value = "cardiologica"}
    }
})

Dim result2 = AgentTurnEngine.ProcessAgentTurnFromText(bundle, state, "visita cardiologica")

Dim http = HttpResponseBuilder.BuildAgentDialogStepHttpResponse(conversationId, documentId, result)
Dim chatText = HttpResponseBuilder.ToChatMessage(result)
```

## Build & test

```powershell
cd dialog-engine
dotnet test
```

## Moduli

| File | Ruolo |
|------|-------|
| `Models.vb` | Ontology, Catalog, Concept, runtime turn types |
| `AgentTurnEngine.vb` | Orchestrazione turno (Extract → Merge → Filter → NextStep) |
| `TurnResultBuilder.vb` | Costruzione risposta turno (confirm, disambigua, no_match) |
| `CatalogFilter.vb` | Filtro candidati on/off su catalog.Items |
| `ConceptExtraction.vb` | ExtractConceptsFromUtterance (grammatiche attributo + vincolo) |
| `ConceptExtraction.vb` | Estrazione concept da testo |
| `ConceptOps.vb` | Merge e normalizzazione concept |
| `AgentSlotMatch.vb` | Scoring candidati, disambiguazione, filtro età |
| `IncomingConcepts.vb` | Filtro concept in ingresso (vincolo / catalog) |
| `GrammarMatcher.vb` | Match utterance su grammatiche categoria |
| `CategoryNormalization.vb` | Normalizzazione nomi categoria e valori |
| `BundleAccess.vb` | Accessori read-only su bundle |
| `DialogPhrases.vb` | Template NLG |
| `HttpResponseBuilder.vb` | JSON webhook + testo chat |
