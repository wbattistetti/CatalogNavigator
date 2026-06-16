''' <summary>
''' Merge and query acquired concepts in conversation state.
''' </summary>
Public Module ConceptOps

    Public Function IsAgeConcept(concept As Models.Concept) As Boolean
        Return concept IsNot Nothing AndAlso
               CategoryNormalization.IsAgeCategoryKey(CategoryNormalization.NormalizeCategoryKey(concept.Category))
    End Function

    Public Function IsVincoloConcept(concept As Models.Concept) As Boolean
        Return concept IsNot Nothing AndAlso
               String.Equals(concept.Kind, "vincolo", StringComparison.OrdinalIgnoreCase)
    End Function

    Public Function AttributeConcepts(concepts As IList(Of Models.Concept)) As List(Of Models.Concept)
        If concepts Is Nothing Then Return New List(Of Models.Concept)()
        Return concepts.Where(Function(c) c IsNot Nothing AndAlso Not IsAgeConcept(c) AndAlso Not IsVincoloConcept(c)).ToList()
    End Function

    ''' <summary>Merges incoming concepts into acquired list (replace by category key).</summary>
    Public Function MergeAcquired(
        existing As IList(Of Models.Concept),
        incoming As IList(Of Models.Concept)
    ) As List(Of Models.Concept)
        Dim merged = CloneConceptList(existing)
        Dim items = If(incoming IsNot Nothing, incoming, New List(Of Models.Concept)())

        For Each concept In items
            If concept Is Nothing Then Continue For
            Dim key = CategoryNormalization.NormalizeCategoryKey(concept.Category)
            If String.IsNullOrEmpty(key) OrElse String.IsNullOrWhiteSpace(concept.Value) Then Continue For

            merged.RemoveAll(Function(c) CategoryNormalization.NormalizeCategoryKey(c.Category) = key)
            merged.Add(New Models.Concept With {
                .Category = concept.Category,
                .Value = concept.Value.Trim(),
                .Kind = If(String.IsNullOrWhiteSpace(concept.Kind),
                    If(IsAgeConcept(concept), "vincolo", "attributo"),
                    concept.Kind),
                .Unit = concept.Unit
            })
        Next

        Return merged
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

    Public Function HasAcquiredCategory(concepts As IList(Of Models.Concept), categoryKey As String) As Boolean
        If concepts Is Nothing OrElse String.IsNullOrWhiteSpace(categoryKey) Then Return False
        Dim key = CategoryNormalization.NormalizeCategoryKey(categoryKey)
        Return concepts.Any(Function(c) CategoryNormalization.NormalizeCategoryKey(c.Category) = key)
    End Function

    Public Function FindAcquiredAgeYears(concepts As IList(Of Models.Concept)) As Integer?
        If concepts Is Nothing Then Return Nothing
        For Each concept In concepts
            If Not IsAgeConcept(concept) Then Continue For
            Dim age = ResolveTurnAge.ParseAgeYearsFromConcept(concept)
            If age.HasValue Then Return age
        Next
        Return Nothing
    End Function

    Public Function AcquiredCount(concepts As IList(Of Models.Concept)) As Integer
        Return If(concepts?.Count, 0)
    End Function

    ''' <summary>Legacy: category key → value map for disambiguation helpers.</summary>
    Public Function AcquiredCategoryKeys(concepts As IList(Of Models.Concept)) As HashSet(Of String)
        Dim keys As New HashSet(Of String)(StringComparer.OrdinalIgnoreCase)
        If concepts Is Nothing Then Return keys
        For Each concept In concepts
            If concept Is Nothing Then Continue For
            Dim key = CategoryNormalization.NormalizeCategoryKey(concept.Category)
            If Not String.IsNullOrEmpty(key) Then keys.Add(key)
        Next
        Return keys
    End Function

End Module
