''' <summary>
''' Extracts concepts from utterance: category grammars (attributo) + resolution pipelines (vincolo).
''' </summary>
Public Module ConceptExtraction

    Public Function ExtractConceptsFromUtterance(
        utterance As String,
        ontology As Models.Ontology,
        Optional pendingCategoryName As String = Nothing,
        Optional pendingOnly As Boolean = False,
        Optional pendingValueKind As String = Nothing,
        Optional pendingAllowedTokens As IList(Of String) = Nothing,
        Optional bundle As Models.AgentBundle = Nothing
    ) As List(Of Models.Concept)
        Dim text = If(utterance, String.Empty).Trim()
        If String.IsNullOrWhiteSpace(text) Then Return New List(Of Models.Concept)()

        If pendingOnly AndAlso Not String.IsNullOrWhiteSpace(pendingCategoryName) Then
            If String.Equals(pendingValueKind, CategoryTypes.ValueKindAgeYears, StringComparison.OrdinalIgnoreCase) Then
                Dim vincoloConcept = VincoloConceptFromUtterance(text, pendingCategoryName, ontology)
                If vincoloConcept Is Nothing Then Return New List(Of Models.Concept)()
                Return New List(Of Models.Concept) From {vincoloConcept}
            End If

            If String.Equals(pendingValueKind, CategoryTypes.ValueKindCanonicalToken, StringComparison.OrdinalIgnoreCase) OrElse
               (pendingAllowedTokens IsNot Nothing AndAlso pendingAllowedTokens.Count > 0 AndAlso
                Not String.Equals(pendingValueKind, CategoryTypes.ValueKindAgeYears, StringComparison.OrdinalIgnoreCase)) Then
                Dim disambiguationConcept = DisambiguationAnswer.ExtractConceptFromUtterance(
                    bundle, pendingCategoryName, pendingAllowedTokens, text)
                If disambiguationConcept Is Nothing Then Return New List(Of Models.Concept)()
                Return New List(Of Models.Concept) From {disambiguationConcept}
            End If
        End If

        Return ConceptsFromUtterance(text, ontology)
    End Function

    Public Function ConceptsFromUtterance(
        utterance As String,
        ontology As Models.Ontology
    ) As List(Of Models.Concept)
        Return GrammarMatcher.ConceptsFromCategoryGrammars(utterance, ontology)
    End Function

    Public Function VincoloConceptFromUtterance(
        utterance As String,
        categoryName As String,
        Optional ontology As Models.Ontology = Nothing
    ) As Models.Concept
        Dim category = CategoryTypes.FindCategoryByName(ontology, categoryName)
        If category IsNot Nothing AndAlso category.Resolution IsNot Nothing Then
            Dim quantity = ResolutionRunner.RunForCategory(category, utterance)
            If quantity IsNot Nothing Then
                Return New Models.Concept With {
                    .Category = category.Name,
                    .Value = quantity.Value.ToString(),
                    .Unit = quantity.Unit,
                    .Kind = Models.ConceptKind.Vincolo
                }
            End If
        End If

        If category IsNot Nothing AndAlso CategoryTypes.IsAgeYearsCategory(category) Then
            Dim age = ResolveTurnAge.ParseAgeYearsFromSlotValue(utterance)
            If age.HasValue Then
                Return New Models.Concept With {
                    .Category = category.Name,
                    .Value = age.Value.ToString(),
                    .Unit = "years",
                    .Kind = Models.ConceptKind.Vincolo
                }
            End If
        End If

        Return Nothing
    End Function

    ''' <summary>Legacy alias.</summary>
    Public Function AgeConceptFromUtterance(
        utterance As String,
        categoryName As String,
        Optional ontology As Models.Ontology = Nothing
    ) As Models.Concept
        Return VincoloConceptFromUtterance(utterance, categoryName, ontology)
    End Function

    ''' <summary>Canonicalizes extracted concepts using ontology category definitions.</summary>
    Public Function NormalizeExtractedConcepts(
        incoming As IList(Of Models.Concept),
        Optional ontology As Models.Ontology = Nothing
    ) As List(Of Models.Concept)
        Dim result As New List(Of Models.Concept)()
        Dim items = If(incoming IsNot Nothing, incoming, New List(Of Models.Concept)())

        For Each concept In items
            If concept Is Nothing Then Continue For
            Dim category = CategoryTypes.FindCategoryByName(ontology, concept.Category)
            Dim kind = If(category IsNot Nothing, category.Kind, concept.Kind)

            If (kind = Models.ConceptKind.Vincolo) AndAlso
               category IsNot Nothing AndAlso
               CategoryTypes.IsAgeYearsCategory(category) Then
                Dim quantity = ResolveTurnAge.NormalizeAgeConceptQuantity(concept)
                If quantity IsNot Nothing Then
                    result.Add(New Models.Concept With {
                        .Category = category.Name,
                        .Value = quantity.Value.ToString(),
                        .Kind = Models.ConceptKind.Vincolo,
                        .Unit = quantity.Unit
                    })
                End If
                Continue For
            End If

            result.Add(New Models.Concept With {
                .Category = If(category IsNot Nothing, category.Name, concept.Category.Trim()),
                .Value = CategoryNormalization.CanonicalizeConceptValue(concept.Value, kind, category),
                .Kind = kind,
                .Unit = concept.Unit
            })
        Next

        Return result
    End Function

End Module
