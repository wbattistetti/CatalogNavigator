''' <summary>
''' Filters catalog items against acquired concepts in the conversation (on/off).
''' </summary>
Public Module CatalogFilter

    Private ReadOnly MissingCategoryValue As String = CategoryTypes.MissingCategoryValue

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

        Return catalog.Items.Where(Function(item) ItemSatisfiesAllConcepts(item, conversation.AcquiredConcepts)).ToList()
    End Function

    Public Function ItemSatisfiesAllConcepts(
        item As Models.CatalogItem,
        concepts As IList(Of Models.Concept)
    ) As Boolean
        If item Is Nothing Then Return False
        If concepts Is Nothing OrElse concepts.Count = 0 Then Return False

        For Each concept In concepts
            If concept Is Nothing Then Continue For
            If Not ItemSatisfiesConcept(item, concept) Then Return False
        Next

        Return True
    End Function

    Public Function ItemSatisfiesConcept(item As Models.CatalogItem, concept As Models.Concept) As Boolean
        If item Is Nothing OrElse concept Is Nothing Then Return False
        If String.IsNullOrWhiteSpace(concept.Category) Then Return False

        If concept.Kind = Models.ConceptKind.Vincolo Then
            Return ItemSatisfiesVincoloConcept(item, concept)
        End If

        If String.Equals(concept.Value, CategoryTypes.MissingCategoryValue, StringComparison.OrdinalIgnoreCase) OrElse
           CategoryTypes.IsMissingCategoryValue(concept.Value) Then
            Return ItemMissingCategoryValue(item, concept.Category)
        End If

        Return item.Concepts.Any(
            Function(c) (c.Kind = Models.ConceptKind.Attributo) AndAlso
                        c.Category = concept.Category AndAlso
                        c.Value = concept.Value
        )
    End Function

    Private Function ItemSatisfiesVincoloConcept(item As Models.CatalogItem, concept As Models.Concept) As Boolean
        Dim totalMonths = ResolveTurnAge.ParseAgeTotalMonthsFromConcept(concept)
        If Not totalMonths.HasValue Then Return True
        Return ConstraintValidation.PathSatisfiesAgeConstraintsFromTotalMonths(
            totalMonths.Value,
            item.AgeConstraints)
    End Function

    Private Function ItemMissingCategoryValue(item As Models.CatalogItem, categoryName As String) As Boolean
        If item Is Nothing OrElse String.IsNullOrWhiteSpace(categoryName) Then Return False
        If item.Concepts Is Nothing OrElse item.Concepts.Count = 0 Then Return True

        Dim categoryConcept = item.Concepts.FirstOrDefault(
            Function(c) c IsNot Nothing AndAlso
                        c.Kind = Models.ConceptKind.Attributo AndAlso
                        String.Equals(c.Category, categoryName, StringComparison.Ordinal))

        If categoryConcept Is Nothing Then Return True
        Return String.Equals(categoryConcept.Value, MissingCategoryValue, StringComparison.OrdinalIgnoreCase)
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
