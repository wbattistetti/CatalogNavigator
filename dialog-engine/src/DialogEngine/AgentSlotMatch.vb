''' <summary>
''' Disambiguation helpers and ConvAI concept validation against prior candidates.
''' </summary>
Imports System.Globalization

Public Module AgentSlotMatch

    Private Const MissingCategoryValue As String = "none"

    Public Class InferredDisambiguation
        Public Property CategoryName As String
        Public Property Options As List(Of String) = New List(Of String)()
    End Class

    Public Class InferredConcept
        Public Property CategoryName As String
        Public Property Value As String
    End Class

    Public Function CandidatePaths(candidates As IList(Of Models.CatalogItem)) As List(Of String)
        If candidates Is Nothing Then Return New List(Of String)()
        Return candidates.Select(Function(item) item.Path).ToList()
    End Function

    Private Function ConceptMatchesCatalogConcept(
        catalogConcept As Models.Concept,
        categoryName As String,
        conceptValue As String
    ) As Boolean
        Return catalogConcept.Category = categoryName AndAlso
               catalogConcept.Value = conceptValue
    End Function

    Public Function ShouldAskAge(
        bundle As Models.AgentBundle,
        candidates As IList(Of Models.CatalogItem),
        conversation As Models.AgentSessionState
    ) As Boolean
        If ConceptOps.HasAcquiredAgeQuantity(AcquiredList(conversation)) Then Return False
        If candidates Is Nothing OrElse candidates.Count <= 1 Then Return False

        If AnyItemHasAgeConstraint(candidates) Then
            Return candidates.Count > 1
        End If

        Return HasUnresolvedAgeVincoloAmongCandidates(bundle, candidates, AcquiredList(conversation))
    End Function

    Private Function AnyItemHasAgeConstraint(candidates As IList(Of Models.CatalogItem)) As Boolean
        Return candidates.Any(
            Function(item) item IsNot Nothing AndAlso
                            item.AgeConstraints IsNot Nothing AndAlso
                            item.AgeConstraints.Count > 0)
    End Function

    Private Function CandidateCategoryNames(candidates As IList(Of Models.CatalogItem)) As HashSet(Of String)
        Dim names As New HashSet(Of String)(StringComparer.Ordinal)
        Dim items = If(candidates IsNot Nothing, candidates, New List(Of Models.CatalogItem)())

        For Each item In items
            If item Is Nothing OrElse item.Concepts Is Nothing Then Continue For
            For Each concept In item.Concepts
                If concept Is Nothing OrElse String.IsNullOrWhiteSpace(concept.Category) Then Continue For
                names.Add(concept.Category.Trim())
            Next
        Next

        Return names
    End Function

    Private Function OrderedCandidateCategories(
        bundle As Models.AgentBundle,
        candidates As IList(Of Models.CatalogItem),
        kindFilter As Models.ConceptKind
    ) As List(Of Models.CategoryDefinition)
        Dim names = CandidateCategoryNames(candidates)
        If names.Count = 0 Then Return New List(Of Models.CategoryDefinition)()
        If bundle Is Nothing OrElse bundle.Ontology Is Nothing OrElse bundle.Ontology.Categories Is Nothing Then
            Return New List(Of Models.CategoryDefinition)()
        End If

        Return bundle.Ontology.Categories.
            Where(Function(c) c IsNot Nothing AndAlso
                             Not String.IsNullOrWhiteSpace(c.Name) AndAlso
                             names.Contains(c.Name) AndAlso
                             (c.Kind = kindFilter)).
            OrderBy(Function(c) c.Order).
            ToList()
    End Function

    Private Function DistinctValuesForCategory(
        candidates As IList(Of Models.CatalogItem),
        categoryName As String
    ) As HashSet(Of String)
        Dim values As New HashSet(Of String)(StringComparer.OrdinalIgnoreCase)
        Dim items = If(candidates IsNot Nothing, candidates, New List(Of Models.CatalogItem)())

        For Each item In items
            If item Is Nothing Then Continue For
            Dim concept As Models.Concept = Nothing
            If item.Concepts IsNot Nothing Then
                concept = item.Concepts.FirstOrDefault(
                    Function(c) c IsNot Nothing AndAlso c.Category = categoryName)
            End If

            If concept IsNot Nothing AndAlso Not String.IsNullOrWhiteSpace(concept.Value) Then
                values.Add(concept.Value.Trim())
            Else
                values.Add(MissingCategoryValue)
            End If
        Next

        Return values
    End Function

    Private Function SortOptions(values As IEnumerable(Of String)) As List(Of String)
        Return values.
            OrderBy(Function(v) v, StringComparer.Create(New CultureInfo("it-IT"), False)).
            ToList()
    End Function

    Private Function HasMeaningfulDistinctValues(values As HashSet(Of String)) As Boolean
        If values Is Nothing OrElse values.Count = 0 Then Return False
        If values.Count = 1 AndAlso values.Contains(MissingCategoryValue) Then Return False
        Return True
    End Function

    Public Function HasUnresolvedAgeVincoloAmongCandidates(
        bundle As Models.AgentBundle,
        candidates As IList(Of Models.CatalogItem),
        acquired As IList(Of Models.Concept)
    ) As Boolean
        For Each category In OrderedCandidateCategories(bundle, candidates, Models.ConceptKind.Vincolo)
            If ConceptOps.HasAcquiredCategory(acquired, category.Name) Then Continue For

            Dim values = DistinctValuesForCategory(candidates, category.Name)
            If HasMeaningfulDistinctValues(values) Then Return True
        Next
        Return False
    End Function

    Public Function FindDisambiguationTarget(
        bundle As Models.AgentBundle,
        candidates As IList(Of Models.CatalogItem),
        acquired As IList(Of Models.Concept)
    ) As InferredDisambiguation
        For Each category In OrderedCandidateCategories(bundle, candidates, Models.ConceptKind.Attributo)
            If ConceptOps.HasAcquiredCategory(acquired, category.Name) Then Continue For

            Dim values = DistinctValuesForCategory(candidates, category.Name)
            If values.Count < 2 Then Continue For

            Return New InferredDisambiguation With {
                .CategoryName = category.Name,
                .Options = SortOptions(values)
            }
        Next
        Return Nothing
    End Function

    Public Function FindInferredConcept(
        bundle As Models.AgentBundle,
        candidates As IList(Of Models.CatalogItem),
        acquired As IList(Of Models.Concept)
    ) As InferredConcept
        For Each category In OrderedCandidateCategories(bundle, candidates, Models.ConceptKind.Attributo)
            If ConceptOps.HasAcquiredCategory(acquired, category.Name) Then Continue For

            Dim values = DistinctValuesForCategory(candidates, category.Name)
            If values.Count <> 1 Then Continue For

            Return New InferredConcept With {
                .CategoryName = category.Name,
                .Value = values.First()
            }
        Next
        Return Nothing
    End Function

    Public Function ConceptMatchesCorpusOnCandidates(
        bundle As Models.AgentBundle,
        candidates As IList(Of Models.CatalogItem),
        concept As Models.Concept
    ) As Boolean
        If concept Is Nothing OrElse String.IsNullOrWhiteSpace(concept.Category) Then Return False
        Dim items = If(candidates IsNot Nothing, candidates, New List(Of Models.CatalogItem)())

        For Each item In items
            If item Is Nothing OrElse item.Concepts Is Nothing Then Continue For
            Dim hasMatch = item.Concepts.Any(
                Function(c) (c.Kind = Models.ConceptKind.Attributo) AndAlso
                            ConceptMatchesCatalogConcept(c, concept.Category, concept.Value)
            )
            If hasMatch Then Return True
        Next
        Return False
    End Function

    Public Function PriorCandidates(
        bundle As Models.AgentBundle,
        conversation As Models.AgentSessionState
    ) As List(Of Models.CatalogItem)
        Return CatalogFilter.FilterCandidates(bundle.Catalog, conversation)
    End Function

    Private Function AcquiredList(conversation As Models.AgentSessionState) As IList(Of Models.Concept)
        If conversation Is Nothing OrElse conversation.AcquiredConcepts Is Nothing Then
            Return New List(Of Models.Concept)()
        End If
        Return conversation.AcquiredConcepts
    End Function

End Module
