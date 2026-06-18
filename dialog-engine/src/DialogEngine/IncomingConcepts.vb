''' <summary>
''' Filters incoming concepts: strict gate when collecting a vincolo, corpus check otherwise.
''' </summary>
Public Module IncomingConcepts

    Private Function ConceptMatchesPendingConstraint(
        concept As Models.Concept,
        pending As Models.ExpectedConstraint
    ) As Boolean
        If pending Is Nothing Then Return False
        If concept.Category <> pending.CategoryName Then Return False

        If String.Equals(pending.ValueKind, CategoryTypes.ValueKindAgeYears, StringComparison.OrdinalIgnoreCase) Then
            Return ResolveTurnAge.ParseAgeYearsFromSlotValue(concept.Value).HasValue
        End If

        Return Not String.IsNullOrWhiteSpace(concept.Value)
    End Function

    Public Function FilterIncomingConcepts(
        bundle As Models.AgentBundle,
        incoming As IList(Of Models.Concept),
        pending As Models.ExpectedConstraint,
        candidates As IList(Of Models.CatalogItem)
    ) As List(Of Models.Concept)
        Dim items = If(incoming IsNot Nothing, incoming, New List(Of Models.Concept)())

        If pending IsNot Nothing AndAlso
           String.Equals(pending.ValueKind, CategoryTypes.ValueKindAgeYears, StringComparison.OrdinalIgnoreCase) Then
            Return items.Where(Function(c) ConceptMatchesPendingConstraint(c, pending)).ToList()
        End If

        Return items.Where(Function(c) AgentSlotMatch.ConceptMatchesCorpusOnCandidates(bundle, candidates, c)).ToList()
    End Function

End Module
