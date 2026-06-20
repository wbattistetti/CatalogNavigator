''' <summary>
''' Disambiguation helpers and ConvAI concept validation against prior candidates.
''' </summary>
Imports System.Globalization

Public Module AgentSlotMatch

    Public Class InferredDisambiguation
        Public Property CategoryName As String
        Public Property Options As List(Of String) = New List(Of String)()
    End Class

    Public Class InferredConcept
        Public Property CategoryName As String
        Public Property ValueSetKey As String
    End Class

    Public Function CandidatePaths(candidates As IList(Of Models.CatalogItem)) As List(Of String)
        If candidates Is Nothing Then Return New List(Of String)()
        Return candidates.Select(Function(item) item.Path).ToList()
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

    Private Function DistinctValueSetKeysForCategory(
        candidates As IList(Of Models.CatalogItem),
        categoryName As String
    ) As HashSet(Of String)
        Dim keys As New HashSet(Of String)(StringComparer.OrdinalIgnoreCase)
        Dim items = If(candidates IsNot Nothing, candidates, New List(Of Models.CatalogItem)())

        For Each item In items
            If item Is Nothing Then Continue For
            keys.Add(ValueSetOps.ItemAttributoValueSetKey(item, categoryName))
        Next

        Return keys
    End Function

    Private Function DistinctVincoloKeysForCategory(
        candidates As IList(Of Models.CatalogItem),
        categoryName As String
    ) As HashSet(Of String)
        Dim keys As New HashSet(Of String)(StringComparer.OrdinalIgnoreCase)
        Dim items = If(candidates IsNot Nothing, candidates, New List(Of Models.CatalogItem)())

        For Each item In items
            If item Is Nothing Then Continue For
            Dim concept As Models.Concept = Nothing
            If item.Concepts IsNot Nothing Then
                concept = item.Concepts.FirstOrDefault(
                    Function(c) c IsNot Nothing AndAlso
                                c.Kind = Models.ConceptKind.Vincolo AndAlso
                                c.Category = categoryName)
            End If

            If concept IsNot Nothing AndAlso ValueSetOps.ValuesFromConcept(concept).Count > 0 Then
                keys.Add(ValueSetOps.ValueSetKey(ValueSetOps.ValuesFromConcept(concept)))
            Else
                keys.Add(CategoryTypes.MissingCategoryValue)
            End If
        Next

        Return keys
    End Function

    Private Function SortOptions(values As IEnumerable(Of String)) As List(Of String)
        Return values.
            OrderBy(Function(v) v, StringComparer.Create(New CultureInfo("it-IT"), False)).
            ToList()
    End Function

    Private Function HasMeaningfulDistinctValueSetKeys(keys As HashSet(Of String)) As Boolean
        If keys Is Nothing OrElse keys.Count = 0 Then Return False
        If keys.Count = 1 AndAlso keys.Contains(CategoryTypes.MissingCategoryValue) Then Return False
        Return True
    End Function

    ''' <summary>
    ''' True when the acquired value set exactly matches one candidate option key and no strict
    ''' superset option remains among surviving candidates (partial mentions stay unresolved).
    ''' </summary>
    Public Function IsAttributoCategoryResolved(
        candidates As IList(Of Models.CatalogItem),
        acquired As IList(Of Models.Concept),
        categoryName As String,
        Optional exactAttributoCategories As IList(Of String) = Nothing
    ) As Boolean
        If candidates Is Nothing OrElse candidates.Count <= 1 Then Return True
        If Not ConceptOps.HasAcquiredCategory(acquired, categoryName) Then Return False

        Dim distinctKeys = DistinctValueSetKeysForCategory(candidates, categoryName)
        If distinctKeys.Count <= 1 Then Return True

        Dim concept = acquired.FirstOrDefault(
            Function(c) c IsNot Nothing AndAlso String.Equals(c.Category, categoryName, StringComparison.Ordinal))
        If concept Is Nothing Then Return False

        Dim acquiredValues = ValueSetOps.ValuesFromConcept(concept)
        Dim acquiredKey = ValueSetOps.ValueSetKey(acquiredValues)
        If Not distinctKeys.Contains(acquiredKey) Then Return False

        If ConceptOps.IsExactAttributoCategory(exactAttributoCategories, categoryName) Then Return True

        For Each otherKey In distinctKeys
            If String.Equals(otherKey, acquiredKey, StringComparison.OrdinalIgnoreCase) Then Continue For
            Dim otherValues = ValueSetOps.ParseValueSetKey(otherKey)
            If otherValues.Count > acquiredValues.Count AndAlso
               ValueSetOps.ValueSetContainsAll(otherValues, acquiredValues) Then
                Return False
            End If
        Next

        Return True
    End Function

    Public Function HasUnresolvedAgeVincoloAmongCandidates(
        bundle As Models.AgentBundle,
        candidates As IList(Of Models.CatalogItem),
        acquired As IList(Of Models.Concept)
    ) As Boolean
        For Each category In OrderedCandidateCategories(bundle, candidates, Models.ConceptKind.Vincolo)
            If ConceptOps.HasAcquiredCategory(acquired, category.Name) Then Continue For

            Dim keys = DistinctVincoloKeysForCategory(candidates, category.Name)
            If HasMeaningfulDistinctValueSetKeys(keys) Then Return True
        Next
        Return False
    End Function

    Public Function FindDisambiguationTarget(
        bundle As Models.AgentBundle,
        candidates As IList(Of Models.CatalogItem),
        acquired As IList(Of Models.Concept),
        Optional exactAttributoCategories As IList(Of String) = Nothing
    ) As InferredDisambiguation
        For Each category In OrderedCandidateCategories(bundle, candidates, Models.ConceptKind.Attributo)
            If IsAttributoCategoryResolved(candidates, acquired, category.Name, exactAttributoCategories) Then Continue For

            Dim keys = DistinctValueSetKeysForCategory(candidates, category.Name)
            If keys.Count < 2 Then Continue For

            Return New InferredDisambiguation With {
                .CategoryName = category.Name,
                .Options = SortOptions(keys)
            }
        Next
        Return Nothing
    End Function

    Public Function FindInferredConcept(
        bundle As Models.AgentBundle,
        candidates As IList(Of Models.CatalogItem),
        acquired As IList(Of Models.Concept),
        Optional exactAttributoCategories As IList(Of String) = Nothing
    ) As InferredConcept
        For Each category In OrderedCandidateCategories(bundle, candidates, Models.ConceptKind.Attributo)
            If IsAttributoCategoryResolved(candidates, acquired, category.Name, exactAttributoCategories) Then Continue For

            Dim keys = DistinctValueSetKeysForCategory(candidates, category.Name)
            If keys.Count <> 1 Then Continue For

            Return New InferredConcept With {
                .CategoryName = category.Name,
                .ValueSetKey = keys.First()
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
        If concept.Kind = Models.ConceptKind.Vincolo Then Return False

        Dim acquiredValues = ValueSetOps.ValuesFromConcept(concept)
        Dim items = If(candidates IsNot Nothing, candidates, New List(Of Models.CatalogItem)())

        For Each item In items
            If item Is Nothing Then Continue For
            Dim itemValues = ValueSetOps.ItemAttributoValues(item, concept.Category)
            If ValueSetOps.ValueSetContainsAll(itemValues, acquiredValues) Then Return True
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
