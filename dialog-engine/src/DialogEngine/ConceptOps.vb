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
            If String.IsNullOrWhiteSpace(categoryName) Then Continue For

            Dim values = NormalizeIncomingValues(concept, kind, category)
            If kind <> Models.ConceptKind.Vincolo AndAlso values.Count = 0 Then Continue For
            If kind = Models.ConceptKind.Vincolo AndAlso ValueSetOps.ScalarValue(
                New Models.Concept With {.Values = values}) = String.Empty Then Continue For

            merged.RemoveAll(Function(c) c.Category = categoryName)
            merged.Add(New Models.Concept With {
                .Category = categoryName,
                .Values = values,
                .Kind = kind,
                .Unit = concept.Unit
            })
        Next

        Return merged
    End Function

    Private Function NormalizeIncomingValues(
        concept As Models.Concept,
        kind As Models.ConceptKind,
        category As Models.CategoryDefinition
    ) As List(Of String)
        Dim raw = ValueSetOps.ValuesFromConcept(concept)
        If kind = Models.ConceptKind.Vincolo Then
            Dim scalar = ValueSetOps.ScalarValue(New Models.Concept With {.Values = raw})
            Return If(String.IsNullOrWhiteSpace(scalar),
                New List(Of String)(),
                New List(Of String) From {scalar.Trim()})
        End If

        Dim normalized As New List(Of String)()
        For Each value In raw
            If CategoryTypes.IsMissingCategoryValue(value) Then
                normalized.Add(CategoryTypes.MissingCategoryValue)
                Continue For
            End If
            Dim canonical = CategoryNormalization.CanonicalizeConceptValue(value, kind, category)
            If String.IsNullOrWhiteSpace(canonical) Then Continue For
            If CategoryTypes.IsMissingCategoryValue(canonical) Then
                normalized.Add(CategoryTypes.MissingCategoryValue)
                Continue For
            End If
            normalized.Add(canonical)
        Next

        Return ApplyCardinalityResolution(normalized, kind, category)
    End Function

    Private Function ApplyCardinalityResolution(
        values As List(Of String),
        kind As Models.ConceptKind,
        category As Models.CategoryDefinition
    ) As List(Of String)
        If kind = Models.ConceptKind.Vincolo Then Return values
        Return CategoryValueResolution.ResolveAttributoValues(category, values)
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
                .Values = ValueSetOps.NormalizeAttributoValues(ValueSetOps.ValuesFromConcept(c)),
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

    Public Function CloneExactAttributoCategories(
        categories As IList(Of String)
    ) As List(Of String)
        If categories Is Nothing Then Return New List(Of String)()
        Return categories.
            Where(Function(c) Not String.IsNullOrWhiteSpace(c)).
            Select(Function(c) c.Trim()).
            Distinct(StringComparer.Ordinal).
            ToList()
    End Function

    Public Function IsExactAttributoCategory(
        exactAttributoCategories As IList(Of String),
        categoryName As String
    ) As Boolean
        If exactAttributoCategories Is Nothing OrElse String.IsNullOrWhiteSpace(categoryName) Then Return False
        Return exactAttributoCategories.Any(
            Function(c) String.Equals(c, categoryName.Trim(), StringComparison.Ordinal))
    End Function

    ''' <summary>
    ''' Tracks attributo categories chosen explicitly via a pending disambiguation answer.
    ''' Implicit NLU updates clear the exact-commit flag for touched categories.
    ''' </summary>
    Public Function ResolveExactAttributoCommits(
        priorConversation As Models.AgentSessionState,
        conceptsThisTurn As IList(Of Models.Concept)
    ) As List(Of String)
        Dim exact = CloneExactAttributoCategories(
            If(priorConversation IsNot Nothing, priorConversation.ExactAttributoCategories, Nothing))

        Dim items = If(conceptsThisTurn IsNot Nothing, conceptsThisTurn, New List(Of Models.Concept)())
        If items.Count = 0 Then Return exact

        Dim pending = If(priorConversation IsNot Nothing, priorConversation.PendingConstraint, Nothing)
        Dim isDisambiguationAnswer =
            pending IsNot Nothing AndAlso
            String.Equals(pending.ValueKind, CategoryTypes.ValueKindCanonicalToken, StringComparison.OrdinalIgnoreCase)

        For Each concept In items
            If concept Is Nothing OrElse String.IsNullOrWhiteSpace(concept.Category) Then Continue For
            Dim categoryName = concept.Category.Trim()

            If isDisambiguationAnswer AndAlso IncomingConcepts.ConceptMatchesPendingDisambiguation(concept, pending) Then
                If Not exact.Contains(categoryName, StringComparer.Ordinal) Then
                    exact.Add(categoryName)
                End If
                Continue For
            End If

            exact.RemoveAll(Function(c) String.Equals(c, categoryName, StringComparison.Ordinal))
        Next

        Return exact
    End Function

End Module
