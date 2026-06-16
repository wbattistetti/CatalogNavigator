Imports DialogEngine.Models
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
