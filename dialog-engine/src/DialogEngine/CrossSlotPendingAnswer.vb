''' <summary>
''' Accepts alternate category slots during pending disambiguation when they match current candidates.
''' </summary>
Public Module CrossSlotPendingAnswer

    Public Function TryExtractDuringPendingDisambiguation(
        bundle As Models.AgentBundle,
        conversation As Models.AgentSessionState,
        utterance As String
    ) As List(Of Models.Concept)
        If bundle Is Nothing OrElse conversation Is Nothing Then Return New List(Of Models.Concept)()
        Dim pending = conversation.PendingConstraint
        If pending Is Nothing Then Return New List(Of Models.Concept)()
        If Not String.Equals(pending.ValueKind, CategoryTypes.ValueKindCanonicalToken, StringComparison.OrdinalIgnoreCase) Then
            Return New List(Of Models.Concept)()
        End If

        Dim text = If(utterance, String.Empty).Trim()
        If String.IsNullOrWhiteSpace(text) Then Return New List(Of Models.Concept)()

        Dim extracted = ConceptExtraction.ConceptsFromUtterance(text, bundle.Ontology)
        Dim normalized = ConceptExtraction.NormalizeExtractedConcepts(extracted, bundle.Ontology)
        If normalized.Count = 0 Then Return New List(Of Models.Concept)()

        Dim priorCandidates = AgentSlotMatch.PriorCandidates(bundle, conversation)
        Return IncomingConcepts.FilterIncomingConcepts(bundle, normalized, pending, priorCandidates)
    End Function

End Module
