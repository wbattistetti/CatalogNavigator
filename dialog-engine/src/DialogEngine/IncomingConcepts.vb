''' <summary>
''' Filters incoming concepts: strict gate when collecting a vincolo, corpus check otherwise.
''' </summary>
Public Module IncomingConcepts

    Private Function CategoryKeyMatchesPending(categoryName As String, pending As Models.ExpectedConstraint) As Boolean
        Return CategoryNormalization.NormalizeCategoryKey(categoryName) =
               CategoryNormalization.NormalizeCategoryKey(pending.CategoryName)
    End Function

    Private Function ConceptMatchesPendingConstraint(
        concept As Models.Concept,
        pending As Models.ExpectedConstraint
    ) As Boolean
        If pending Is Nothing Then Return False
        If Not CategoryKeyMatchesPending(concept.Category, pending) Then Return False

        If pending.ValueKind = "age_years" Then
            Return CategoryNormalization.IsAgeCategoryKey(CategoryNormalization.NormalizeCategoryKey(concept.Category)) AndAlso
                   ResolveTurnAge.ParseAgeYearsFromSlotValue(concept.Value).HasValue
        End If

        Return Not String.IsNullOrWhiteSpace(concept.Value)
    End Function

    Public Function FilterIncomingConcepts(
        bundle As Models.AgentBundle,
        incoming As IList(Of Models.Concept),
        pending As Models.ExpectedConstraint,
        candidatePaths As IList(Of String)
    ) As List(Of Models.Concept)
        Dim items = If(incoming IsNot Nothing, incoming, New List(Of Models.Concept)())

        If pending IsNot Nothing AndAlso pending.ValueKind = "age_years" Then
            Return items.Where(Function(c) ConceptMatchesPendingConstraint(c, pending)).ToList()
        End If

        Return items.Where(Function(c) AgentSlotMatch.ConceptMatchesCorpusOnPaths(bundle, candidatePaths, c)).ToList()
    End Function

End Module
