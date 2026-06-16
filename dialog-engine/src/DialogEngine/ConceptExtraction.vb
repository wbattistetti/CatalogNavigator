''' <summary>
''' Extracts concepts from utterance: category grammars (attributo) + resolution pipelines (vincolo).
''' </summary>
Public Module ConceptExtraction

    Public Function ExtractConceptsFromUtterance(
        utterance As String,
        ontology As Models.Ontology,
        Optional pendingCategoryName As String = Nothing,
        Optional pendingOnly As Boolean = False
    ) As List(Of Models.Concept)
        Dim text = If(utterance, String.Empty).Trim()
        If String.IsNullOrWhiteSpace(text) Then Return New List(Of Models.Concept)()

        If pendingOnly AndAlso Not String.IsNullOrWhiteSpace(pendingCategoryName) Then
            Dim ageConcept = AgeConceptFromUtterance(text, pendingCategoryName, ontology)
            If ageConcept Is Nothing Then Return New List(Of Models.Concept)()
            ageConcept.Kind = "vincolo"
            Return New List(Of Models.Concept) From {ageConcept}
        End If

        Return ConceptsFromUtterance(text, ontology)
    End Function

    Public Function ConceptsFromUtterance(
        utterance As String,
        ontology As Models.Ontology
    ) As List(Of Models.Concept)
        Return GrammarMatcher.ConceptsFromCategoryGrammars(utterance, ontology)
    End Function

    Public Function AgeConceptFromUtterance(
        utterance As String,
        categoryName As String,
        Optional ontology As Models.Ontology = Nothing
    ) As Models.Concept
        Dim category = FindCategoryByName(ontology, categoryName)
        If category IsNot Nothing AndAlso category.Resolution IsNot Nothing Then
            Dim quantity = ResolutionRunner.RunForCategory(category, utterance)
            If quantity IsNot Nothing Then
                Return New Models.Concept With {
                    .Category = categoryName,
                    .Value = quantity.Value.ToString(),
                    .Unit = quantity.Unit,
                    .Kind = "vincolo"
                }
            End If
        End If

        Dim age = ResolveTurnAge.ParseAgeYearsFromSlotValue(utterance)
        If Not age.HasValue Then Return Nothing
        Return New Models.Concept With {
            .Category = categoryName,
            .Value = age.Value.ToString(),
            .Unit = "years",
            .Kind = "vincolo"
        }
    End Function

    ''' <summary>Canonicalizes extracted concepts (age years, kind/unit, default attributo).</summary>
    Public Function NormalizeExtractedConcepts(incoming As IList(Of Models.Concept)) As List(Of Models.Concept)
        Dim result As New List(Of Models.Concept)()
        Dim items = If(incoming IsNot Nothing, incoming, New List(Of Models.Concept)())

        For Each concept In items
            If concept Is Nothing Then Continue For
            Dim key = CategoryNormalization.NormalizeCategoryKey(concept.Category)
            If CategoryNormalization.IsAgeCategoryKey(key) Then
                If ResolveTurnAge.LooksLikeFasciaConstraintToken(concept.Value) Then Continue For
                Dim age = ResolveTurnAge.ParseAgeYearsFromConcept(concept)
                If age.HasValue Then
                    result.Add(New Models.Concept With {
                        .Category = concept.Category,
                        .Value = age.Value.ToString(),
                        .Kind = "vincolo",
                        .Unit = "years"
                    })
                End If
                Continue For
            End If
            result.Add(New Models.Concept With {
                .Category = concept.Category,
                .Value = concept.Value,
                .Kind = If(String.IsNullOrWhiteSpace(concept.Kind), "attributo", concept.Kind),
                .Unit = concept.Unit
            })
        Next

        Return result
    End Function

    Private Function FindCategoryByName(
        ontology As Models.Ontology,
        categoryName As String
    ) As Models.CategoryDefinition
        If ontology Is Nothing OrElse ontology.Categories Is Nothing OrElse String.IsNullOrWhiteSpace(categoryName) Then
            Return Nothing
        End If
        Dim key = CategoryNormalization.NormalizeCategoryKey(categoryName)
        Return ontology.Categories.FirstOrDefault(
            Function(c) CategoryNormalization.NormalizeCategoryKey(c.Name) = key)
    End Function

End Module
