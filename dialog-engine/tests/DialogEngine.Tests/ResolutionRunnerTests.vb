Imports DialogEngine.Models
Imports System.Text.RegularExpressions
Imports Xunit

Public Class ResolutionRunnerTests

    <Fact>
    Public Sub ResolvesBareNumber()
        Dim pipeline = TestBundleFactory.BuildAgeVincoloResolutionPipeline()
        Dim result = ResolutionRunner.Run(pipeline, "20")
        Assert.NotNull(result)
        Assert.Equal(20, result.Value)
        Assert.Equal("years", result.Unit)
    End Sub

    <Fact>
    Public Sub ResolvesItalianWord_Venti()
        Dim pipeline = TestBundleFactory.BuildAgeVincoloResolutionPipeline()
        Dim result = ResolutionRunner.Run(pipeline, "mio figlio ha venti anni")
        Assert.NotNull(result)
        Assert.Equal(20, result.Value)
        Assert.Equal("years", result.Unit)
    End Sub

    <Fact>
    Public Sub ResolvesApostrophe_VentAnni()
        Dim pipeline = TestBundleFactory.BuildAgeVincoloResolutionPipeline()
        Dim result = ResolutionRunner.Run(pipeline, "mio figlio ha vent'anni")
        Assert.NotNull(result)
        Assert.Equal(20, result.Value)
        Assert.Equal("years", result.Unit)
    End Sub

    <Fact>
    Public Sub ResolvesWordMonths_DodiciMesi()
        Dim pipeline = TestBundleFactory.BuildAgeVincoloResolutionPipeline()
        Dim result = ResolutionRunner.Run(pipeline, "dodici mesi")
        Assert.NotNull(result)
        Assert.Equal(12, result.Value)
        Assert.Equal("months", result.Unit)
    End Sub

    <Fact>
    Public Sub ResolvesCompoundWord_TrentacinqueAnni()
        Dim pipeline = TestBundleFactory.BuildAgeVincoloResolutionPipeline()
        Dim result = ResolutionRunner.Run(pipeline, "trentacinque anni")
        Assert.NotNull(result)
        Assert.Equal(35, result.Value)
        Assert.Equal("years", result.Unit)
    End Sub

    <Fact>
    Public Sub ResolvesNumericWithUnit_Months()
        Dim pipeline = TestBundleFactory.BuildAgeVincoloResolutionPipeline()
        Dim result = ResolutionRunner.Run(pipeline, "12 mesi")
        Assert.NotNull(result)
        Assert.Equal(12, result.Value)
        Assert.Equal("months", result.Unit)
    End Sub

    <Fact>
    Public Sub ResolvesCompoundWord_VentitréAnni()
        Dim pipeline = TestBundleFactory.BuildAgeVincoloResolutionPipeline()
        Dim result = ResolutionRunner.Run(pipeline, "ventitré anni")
        Assert.NotNull(result)
        Assert.Equal(23, result.Value)
        Assert.Equal("years", result.Unit)
    End Sub

    <Fact>
    Public Sub WordUnitCapturePattern_UsesWordBoundaries()
        Dim pipeline = TestBundleFactory.BuildAgeVincoloResolutionPipeline()
        Dim wordStep = pipeline.Steps.First(Function(s) s.Type = "word_unit_capture")
        Assert.Contains("\bventitré\b", wordStep.Pattern)
        Assert.Contains("\bventi\b", wordStep.Pattern)
        Assert.Contains("ventitre", wordStep.Pattern)
        Dim normalized = ResolutionRunner.NormalizeAgeUtterance("ventitré anni")
        Assert.True(Regex.IsMatch(normalized, wordStep.Pattern, RegexOptions.IgnoreCase))
    End Sub

    <Fact>
    Public Sub AgeUnitConverter_ConvertsMonthsToYears()
        Dim years = AgeUnitConverter.ToYears(12, "months")
        Assert.Equal(1, years)
    End Sub

    <Fact>
    Public Sub AgeUnitConverter_PreservesSixMonthsAsTotalMonths()
        Dim months = AgeUnitConverter.ToTotalMonths(6, "months")
        Assert.Equal(6, months)
        Assert.Equal(0, AgeUnitConverter.ToYears(6, "months"))
    End Sub

    <Fact>
    Public Sub NormalizeExtractedConcepts_PreservesSixMonthsUnit()
        Dim bundle = TestBundleFactory.BuildCardioBundle()
        TestBundleFactory.AddAgeVincoloResolution(bundle)
        Dim category = bundle.Ontology.Categories.First(Function(c) c.Name = "fascia di età")
        Dim raw = ResolutionRunner.Run(category.Resolution, "6 mesi")
        Assert.NotNull(raw)
        Assert.Equal(6, raw.Value)
        Assert.Equal("months", raw.Unit)

        Dim incoming = New List(Of Concept) From {
            New Concept With {
                .Category = "fascia di età",
                .Values = New List(Of String) From {raw.Value.ToString()},
                .Unit = raw.Unit,
                .Kind = ConceptKind.Vincolo
            }
        }
        Dim normalized = ConceptExtraction.NormalizeExtractedConcepts(incoming, bundle.Ontology)
        Assert.Single(normalized)
        Assert.Equal("6", ValueSetOps.ScalarValue(normalized(0)))
        Assert.Equal("months", normalized(0).Unit)
    End Sub

    <Fact>
    Public Sub NormalizeAgeUtterance_ExpandsVentAnni()
        Dim normalized = ResolutionRunner.NormalizeAgeUtterance("ha vent'anni")
        Assert.Contains("venti anni", normalized)
    End Sub

    <Fact>
    Public Sub NormalizeAgeUtterance_ExpandsTrentAnni()
        Dim normalized = ResolutionRunner.NormalizeAgeUtterance("trent'anni")
        Assert.Equal("trenta anni", normalized)
    End Sub

    <Fact>
    Public Sub NormalizeAgeUtterance_StripsTrailingPunctuation()
        Dim normalized = ResolutionRunner.NormalizeAgeUtterance("Trent'anni.")
        Assert.Equal("trenta anni", normalized)
    End Sub

    <Fact>
    Public Sub ResolvesApostrophe_TrentAnni()
        Dim pipeline = TestBundleFactory.BuildAgeVincoloResolutionPipeline()
        Dim result = ResolutionRunner.Run(pipeline, "trent'anni")
        Assert.NotNull(result)
        Assert.Equal(30, result.Value)
        Assert.Equal("years", result.Unit)
    End Sub

    <Fact>
    Public Sub ResolvesNumericDaysAndWeeks()
        Dim pipeline = TestBundleFactory.BuildAgeVincoloResolutionPipeline()
        Dim days = ResolutionRunner.Run(pipeline, "2 giorni")
        Assert.NotNull(days)
        Assert.Equal(2, days.Value)
        Assert.Equal("days", days.Unit)

        Dim weeks = ResolutionRunner.Run(pipeline, "5 settimane")
        Assert.NotNull(weeks)
        Assert.Equal(5, weeks.Value)
        Assert.Equal("weeks", weeks.Unit)
    End Sub

    <Fact>
    Public Sub ResolvesWordDays_DueGiorni()
        Dim pipeline = TestBundleFactory.BuildAgeVincoloResolutionPipeline()
        Dim result = ResolutionRunner.Run(pipeline, "due giorni")
        Assert.NotNull(result)
        Assert.Equal(2, result.Value)
        Assert.Equal("days", result.Unit)
    End Sub

    <Fact>
    Public Sub ExtractAgeYearsFromText_TrentAnni()
        Dim age = ConstraintValidation.ExtractAgeYearsFromText("trent'anni")
        Assert.Equal(30, age)
    End Sub

    <Fact>
    Public Sub DoesNotTreatArticleUna_InBookingPhrase_AsAge()
        Dim pipeline = TestBundleFactory.BuildAgeVincoloResolutionPipeline()
        Dim result = ResolutionRunner.Run(
            pipeline,
            "vorrei prenotare una prima visita angiologica con ecodoppler")
        Assert.Null(result)
    End Sub

    <Fact>
    Public Sub ResolvesUnAnno_WithExplicitUnit()
        Dim pipeline = TestBundleFactory.BuildAgeVincoloResolutionPipeline()
        Dim result = ResolutionRunner.Run(pipeline, "il bambino ha un anno")
        Assert.NotNull(result)
        Assert.Equal(1, result.Value)
        Assert.Equal("years", result.Unit)
    End Sub

End Class
