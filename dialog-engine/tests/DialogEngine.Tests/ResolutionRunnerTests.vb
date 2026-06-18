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
    Public Sub NormalizeAgeUtterance_ExpandsVentAnni()
        Dim normalized = ResolutionRunner.NormalizeAgeUtterance("ha vent'anni")
        Assert.Contains("venti anni", normalized)
    End Sub

End Class
