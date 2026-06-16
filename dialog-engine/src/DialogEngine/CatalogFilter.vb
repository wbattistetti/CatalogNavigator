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

        Dim concepts = AcquiredFromConversation(conversation)
        If concepts.Count = 0 Then Return New List(Of Models.CatalogItem)()

        Return catalog.Items.Where(Function(item) ItemSatisfiesAllConcepts(item, concepts)).ToList()
    End Function

    Private Function AcquiredFromConversation(conversation As Models.AgentSessionState) As List(Of Models.Concept)
        If conversation Is Nothing OrElse conversation.AcquiredConcepts Is Nothing Then
            Return New List(Of Models.Concept)()
        End If
        Return conversation.AcquiredConcepts
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

        Dim categoryKey = CategoryNormalization.NormalizeCategoryKey(concept.Category)
        If String.IsNullOrEmpty(categoryKey) Then Return False

        If ConceptOps.IsVincoloConcept(concept) OrElse ConceptOps.IsAgeConcept(concept) Then
            Return ItemSatisfiesAgeConcept(item, concept.Value)
        End If

        Return item.Concepts.Any(
            Function(c) BundleAccess.IsAttributoConcept(c) AndAlso
                        CategoryNormalization.NormalizeCategoryKey(c.Category) = categoryKey AndAlso
                        CategoryNormalization.NormalizeConceptValue(c.Value) =
                        CategoryNormalization.NormalizeConceptValue(concept.Value)
        )
    End Function

    Private Function ItemSatisfiesAgeConcept(item As Models.CatalogItem, value As String) As Boolean
        Dim age = ResolveTurnAge.ParseAgeYearsFromSlotValue(value)
        If Not age.HasValue Then Return True
        Return ConstraintValidation.PathSatisfiesAgeConstraints(age.Value, item.AgeConstraints)
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
