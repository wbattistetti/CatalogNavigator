''' <summary>
''' Merge and query acquired concepts in conversation state.
''' </summary>
Public Module ConceptOps

    ''' <summary>Merges incoming concepts into acquired list (replace by category name).</summary>
    Public Function MergeAcquired(
        existing As IList(Of Models.Concept),
        incoming As IList(Of Models.Concept),
        Optional ontology As Models.Ontology = Nothing
    ) As List(Of Models.Concept)
        Dim merged = CloneConceptList(existing)
        Dim items = If(incoming IsNot Nothing, incoming, New List(Of Models.Concept)())

        For Each concept In items
            If concept Is Nothing Then Continue For
            Dim category = CategoryTypes.FindCategoryByName(ontology, concept.Category)
            Dim categoryName = If(category IsNot Nothing, category.Name, concept.Category.Trim())
            Dim kind = ResolveKind(concept, ontology)
            Dim value = CategoryNormalization.CanonicalizeConceptValue(concept.Value, kind, category)
            If String.IsNullOrWhiteSpace(categoryName) OrElse String.IsNullOrWhiteSpace(value) Then Continue For

            merged.RemoveAll(Function(c) c.Category = categoryName)
            merged.Add(New Models.Concept With {
                .Category = categoryName,
                .Value = value,
                .Kind = kind,
                .Unit = concept.Unit
            })
        Next

        Return merged
    End Function

    Private Function ResolveKind(concept As Models.Concept, ontology As Models.Ontology) As Models.ConceptKind
        Dim category = CategoryTypes.FindCategoryByName(ontology, concept.Category)
        If category IsNot Nothing Then Return category.Kind
        Return concept.Kind
    End Function

    Public Function CloneConceptList(concepts As IList(Of Models.Concept)) As List(Of Models.Concept)
        If concepts Is Nothing Then Return New List(Of Models.Concept)()
        Return concepts.
            Where(Function(c) c IsNot Nothing).
            Select(Function(c) New Models.Concept With {
                .Category = c.Category,
                .Value = c.Value,
                .Kind = c.Kind,
                .Unit = c.Unit
            }).ToList()
    End Function

    Public Function HasAcquiredCategory(concepts As IList(Of Models.Concept), categoryName As String) As Boolean
        If concepts Is Nothing OrElse String.IsNullOrWhiteSpace(categoryName) Then Return False
        Return concepts.Any(Function(c) c.Category = categoryName)
    End Function

    Public Function HasAcquiredAgeQuantity(concepts As IList(Of Models.Concept)) As Boolean
        If concepts Is Nothing Then Return False
        For Each concept In concepts
            If concept Is Nothing OrElse concept.Kind <> Models.ConceptKind.Vincolo Then Continue For
            If ResolveTurnAge.HasResolvedAgeQuantity(concept) Then Return True
        Next
        Return False
    End Function

    Public Function FindAcquiredAgeYears(concepts As IList(Of Models.Concept)) As Integer?
        If concepts Is Nothing Then Return Nothing
        For Each concept In concepts
            If concept.Kind <> Models.ConceptKind.Vincolo Then Continue For
            Dim age = ResolveTurnAge.ParseAgeYearsFromConcept(concept)
            If age.HasValue Then Return age
        Next
        Return Nothing
    End Function

    Public Function AcquiredCount(concepts As IList(Of Models.Concept)) As Integer
        Return If(concepts?.Count, 0)
    End Function

End Module
