''' <summary>
''' Tests for category cardinality and winner resolution (aligned with TypeScript).
''' </summary>
Imports DialogEngine.Models
Imports Xunit

Public Class CategoryValueResolutionTests

  Private Shared Function TipoVisitaCategory(Optional winner As String = "controllo") As CategoryDefinition
    Return New CategoryDefinition With {
      .Name = "tipo visita",
      .Kind = ConceptKind.Attributo,
      .Cardinality = CategoryValueResolution.CardinalitySingle,
      .Winner = winner,
      .AllowedValues = New List(Of String) From {"prima", "controllo"}
    }
  End Function

  Private Shared Function EsameCategory() As CategoryDefinition
    Return New CategoryDefinition With {
      .Name = "esame",
      .Kind = ConceptKind.Attributo,
      .Cardinality = CategoryValueResolution.CardinalityMulti,
      .AllowedValues = New List(Of String) From {"ecg", "ecocolordoppler cardiaco"}
    }
  End Function

  <Fact>
  Public Sub ResolveAttributoValues_KeepsMultipleForMultiCardinality()
    Dim category = EsameCategory()
    Dim result = CategoryValueResolution.ResolveAttributoValues(
      category,
      New List(Of String) From {"ecg", "ecocolordoppler cardiaco"})
    Assert.Equal(New List(Of String) From {"ecg", "ecocolordoppler cardiaco"}, result)
  End Sub

  <Fact>
  Public Sub ResolveAttributoValues_AppliesWinnerOnSingleConflict()
    Dim category = TipoVisitaCategory()
    Dim result = CategoryValueResolution.ResolveAttributoValues(
      category,
      New List(Of String) From {"prima", "controllo"})
    Assert.Equal(New List(Of String) From {"controllo"}, result)
  End Sub

  <Fact>
  Public Sub ResolveAttributoValues_ReturnsUnresolvedWhenNoWinner()
    Dim category = TipoVisitaCategory(winner:=Nothing)
    Dim result = CategoryValueResolution.ResolveAttributoValues(
      category,
      New List(Of String) From {"prima", "controllo"})
    Assert.Equal(2, result.Count)
    Assert.Contains("prima", result)
    Assert.Contains("controllo", result)
    Assert.True(CategoryValueResolution.HasCardinalityConflict(category, result))
  End Sub

  <Fact>
  Public Sub HasCardinalityConflict_FalseWhenWinnerResolves()
    Dim category = TipoVisitaCategory()
    Assert.False(CategoryValueResolution.HasCardinalityConflict(
      category,
      New List(Of String) From {"prima", "controllo"}))
  End Sub

  <Fact>
  Public Sub MatchAllGrammarValues_FindsEveryMappingGroup()
    Dim category = New CategoryDefinition With {
      .Name = "tipo visita",
      .Kind = ConceptKind.Attributo,
      .AllowedValues = New List(Of String) From {"prima", "controllo"},
      .Grammar = New CategoryGrammar With {
        .Regex = "(?<prima>visita specialistica|prima)|(?<controllo>di\s+controllo|controllo)",
        .Mappings = New Dictionary(Of String, String) From {
          {"prima", "prima"},
          {"controllo", "controllo"}
        }
      }
    }

    Dim matches = GrammarMatcher.MatchAllGrammarValues(
      "visita specialistica angiologica di controllo",
      category)

    Assert.Equal(New List(Of String) From {"prima", "controllo"}, matches)
  End Sub

  <Fact>
  Public Sub ConceptsFromUtterance_AppliesWinnerOnTipoVisitaConflict()
    Dim bundle = TestBundleFactory.BuildAngiologicaWinnerBundle()
    TestBundleFactory.AddAngiologicaWinnerGrammars(bundle)

    Dim concepts = GrammarMatcher.ConceptsFromCategoryGrammars(
      "VISITA SPECIALISTICA ANGIOLOGICA DI CONTROLLO",
      bundle.Ontology)

    Dim tipoVisita = concepts.FirstOrDefault(Function(c) c.Category = "tipo visita")
    Assert.NotNull(tipoVisita)
    Assert.Equal(New List(Of String) From {"controllo"}, tipoVisita.Values)

    Dim specialita = concepts.FirstOrDefault(Function(c) c.Category = "specialità")
    Assert.NotNull(specialita)
    Assert.Equal(New List(Of String) From {"angiologica"}, specialita.Values)
  End Sub

  <Fact>
  Public Sub NormalizeExtractedConcepts_AppliesWinnerOnIncomingMultiValue()
    Dim bundle = TestBundleFactory.BuildAngiologicaWinnerBundle()
    Dim incoming = New List(Of Concept) From {
      ValueSetOps.CreateAttributoConcept("tipo visita", New List(Of String) From {"prima", "controllo"})
    }

    Dim normalized = ConceptExtraction.NormalizeExtractedConcepts(incoming, bundle.Ontology)
    Assert.Single(normalized)
    Assert.Equal(New List(Of String) From {"controllo"}, normalized(0).Values)
  End Sub

  <Fact>
  Public Sub TryExtractNamedGroupPattern_HandlesNestedGroups()
    Dim combined = "(?<maxillo>maxillo(?:\s+facciale)?)|(?<generale>generale)"
    Dim pattern = GrammarMatcher.TryExtractNamedGroupPattern(combined, "maxillo")
    Assert.Equal("(?<maxillo>maxillo(?:\s+facciale)?)", pattern)
    Assert.Matches(
      New System.Text.RegularExpressions.Regex(pattern, System.Text.RegularExpressions.RegexOptions.IgnoreCase),
      "visita maxillo facciale")
  End Sub

End Class
