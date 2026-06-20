''' <summary>
''' Filters catalog items against acquired concepts in the conversation (on/off).
''' </summary>
Public Module CatalogFilter

    Public Function FilterCandidates(
        catalog As Models.Catalog,
        conversation As Models.AgentSessionState
    ) As List(Of Models.CatalogItem)
        If catalog Is Nothing OrElse catalog.Items Is Nothing OrElse catalog.Items.Count = 0 Then
            Return New List(Of Models.CatalogItem)()
        End If

        If conversation Is Nothing OrElse conversation.AcquiredConcepts Is Nothing OrElse conversation.AcquiredConcepts.Count = 0 Then
            Return New List(Of Models.CatalogItem)()
        End If

        Return catalog.Items.Where(
            Function(item) ItemSatisfiesAllConcepts(item, conversation.AcquiredConcepts, conversation.ExactAttributoCategories)
        ).ToList()
    End Function

    Public Function ItemSatisfiesAllConcepts(
        item As Models.CatalogItem,
        concepts As IList(Of Models.Concept),
        Optional exactAttributoCategories As IList(Of String) = Nothing
    ) As Boolean
        If item Is Nothing Then Return False
        If concepts Is Nothing OrElse concepts.Count = 0 Then Return False

        For Each concept In concepts
            If concept Is Nothing Then Continue For
            If Not ItemSatisfiesConcept(item, concept, exactAttributoCategories) Then Return False
        Next

        Return True
    End Function

    Public Function ItemSatisfiesConcept(
        item As Models.CatalogItem,
        concept As Models.Concept,
        Optional exactAttributoCategories As IList(Of String) = Nothing
    ) As Boolean
        If item Is Nothing OrElse concept Is Nothing Then Return False
        If String.IsNullOrWhiteSpace(concept.Category) Then Return False

        If concept.Kind = Models.ConceptKind.Vincolo Then
            Return ItemSatisfiesVincoloConcept(item, concept)
        End If

        Dim acquiredValues = ValueSetOps.ValuesFromConcept(concept)
        If ValueSetOps.IsMissingValueList(acquiredValues) Then
            Return ItemMissingCategoryValue(item, concept.Category)
        End If

        Dim itemValues = ValueSetOps.ItemAttributoValues(item, concept.Category)
        If ConceptOps.IsExactAttributoCategory(exactAttributoCategories, concept.Category) Then
            Return ValueSetOps.ValueSetsEqual(itemValues, acquiredValues)
        End If
        Return ValueSetOps.ValueSetContainsAll(itemValues, acquiredValues)
    End Function

    Private Function ItemSatisfiesVincoloConcept(item As Models.CatalogItem, concept As Models.Concept) As Boolean
        Dim totalWeeks = ResolveTurnAge.ParseAgeTotalWeeksFromConcept(concept)
        If Not totalWeeks.HasValue Then Return True
        Return ConstraintValidation.PathSatisfiesAgeConstraintsFromTotalWeeks(
            totalWeeks.Value,
            item.AgeConstraints)
    End Function

    Private Function ItemMissingCategoryValue(item As Models.CatalogItem, categoryName As String) As Boolean
        If item Is Nothing OrElse String.IsNullOrWhiteSpace(categoryName) Then Return False
        If item.Concepts Is Nothing OrElse item.Concepts.Count = 0 Then Return True

        Dim categoryConcept = ValueSetOps.FindItemAttributoConcept(item, categoryName)
        If categoryConcept Is Nothing Then Return True
        Return ValueSetOps.IsMissingValueList(ValueSetOps.ValuesFromConcept(categoryConcept))
    End Function

    Public Function FilterCandidatePathsByAge(
        paths As IList(Of String),
        ageYears As Integer,
        catalog As Models.Catalog
    ) As List(Of String)
        If paths Is Nothing OrElse catalog Is Nothing OrElse catalog.Items Is Nothing Then
            Return New List(Of String)()
        End If

        Dim itemsByPath = catalog.Items.ToDictionary(Function(item) item.Path)
        Return paths.Where(Function(path)
                               If Not itemsByPath.ContainsKey(path) Then Return False
                               Return ConstraintValidation.PathSatisfiesAgeConstraints(ageYears, itemsByPath(path).AgeConstraints)
                           End Function).ToList()
    End Function

End Module
