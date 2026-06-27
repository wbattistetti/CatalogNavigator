''' <summary>
''' Unit tests for combinatorial disambiguation answer grammars.
''' </summary>
Imports Xunit

Public Class CombinatorialAnswerGrammarTests

    Private Shared ReadOnly CombinedOptions As String() = {
        "ECG+Ecodoppler",
        "ECG+Holter",
        "Holter"
    }

    <Fact>
    Public Sub IsCombinatorialGrammar_TreatsNullFlagAsFalse()
        Dim grammar = New Models.CategoryGrammar With {
            .Regex = "(?<a>a)",
            .Mappings = New Dictionary(Of String, String) From {{"a", "a"}}
        }
        Assert.False(CombinatorialAnswerGrammar.IsCombinatorialGrammar(grammar))
        Assert.False(CombinatorialAnswerGrammar.IsCombinatorialGrammar(Nothing))
    End Sub

    <Fact>
    Public Sub MatchAllAtoms_FindsMultipleMentions()
        Dim grammar = BuildSampleGrammar()
        Dim mentioned = CombinatorialAnswerGrammar.MatchAllAtoms("vorrei ecg e doppler", grammar)

        Assert.Contains("ECG", mentioned)
        Assert.Contains("Ecodoppler", mentioned)
        Assert.DoesNotContain("Holter", mentioned)
    End Sub

    <Fact>
    Public Sub MatchAndResolveOptionKey_ReturnsExactCatalogKey()
        Dim grammar = BuildSampleGrammar()
        Dim resolved = CombinatorialAnswerGrammar.MatchAndResolveOptionKey(
            "ecg e ecodoppler",
            grammar,
            CombinedOptions.ToList())

        Assert.Equal("ECG+Ecodoppler", resolved)
    End Sub

    <Fact>
    Public Sub MatchAndResolveOptionKey_UsesMaximalFallback()
        Dim grammar = BuildSampleGrammar()
        Dim resolved = CombinatorialAnswerGrammar.MatchAndResolveOptionKey(
            "ecg",
            grammar,
            CombinedOptions.ToList())

        Assert.Equal("ECG+Ecodoppler", resolved)
    End Sub

    Private Shared Function BuildSampleGrammar() As Models.CategoryGrammar
        Return New Models.CategoryGrammar With {
            .Combinatorial = True,
            .Regex = "(?<ecg>ecg|elettrocardiogramma)|(?<ecodoppler>ecodoppler|doppler)|(?<holter>holter)",
            .Mappings = New Dictionary(Of String, String) From {
                {"ecg", "ECG"},
                {"ecodoppler", "Ecodoppler"},
                {"holter", "Holter"}
            }
        }
    End Function

End Class
