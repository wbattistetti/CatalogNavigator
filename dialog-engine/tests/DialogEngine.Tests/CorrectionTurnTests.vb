''' <summary>
''' Tests for retroactive user correction (overwrite, negation, LIFO rollback).
''' </summary>
Imports DialogEngine.Models
Imports Xunit

Public Class CorrectionTurnTests

    <Fact>
    Public Sub CorrectionIntent_DetectsIntendevoPayload()
        Dim parsed = CorrectionIntent.TryParse("intendevo una visita urologica")
        Assert.True(parsed.IsCorrection)
        Assert.Equal("visita urologica", parsed.PayloadText)
    End Sub

    <Fact>
    Public Sub CorrectionIntent_DetectsMiSonoSbagliatoPayload()
        Dim parsed = CorrectionIntent.TryParse("mi sono sbagliato, intendevo visita urologica")
        Assert.True(parsed.IsCorrection)
        Assert.Equal("visita urologica", parsed.PayloadText)
    End Sub

    <Fact>
    Public Sub CorrectionIntent_DetectsScusiIntendevoPayload()
        Dim parsed = CorrectionIntent.TryParse("scusi intendevo una radiologica")
        Assert.True(parsed.IsCorrection)
        Assert.Equal("radiologica", parsed.PayloadText)
    End Sub

    <Fact>
    Public Sub CorrectionIntent_DetectsScusaVolevoPayload()
        Dim parsed = CorrectionIntent.TryParse("scusa volevo una radiologica")
        Assert.True(parsed.IsCorrection)
        Assert.Equal("radiologica", parsed.PayloadText)
    End Sub

    <Fact>
    Public Sub ConfirmsRadiologica_WhenScusiIntendevoDuringPendingExam()
        Dim bundle = TestBundleFactory.BuildMultiExamBundle()
        TestBundleFactory.AddSpecialitaGrammar(bundle)

        Dim step1 = AgentTurnEngine.ProcessAgentTurn(bundle, AgentTurnEngine.InitAgentSession(), New AgentTurnInput With {
            .IncomingConcepts = New List(Of Concept) From {
                Attr("specialità", "cardiologica"),
                Attr("tipo visita", "prima")
            }
        })

        Assert.Equal("disambiguate", step1.Instruction.Action)
        Assert.Equal("esami", step1.Instruction.CategoryName)
        Assert.NotNull(step1.NextState.PendingConstraint)

        Dim result = AgentTurnEngine.ProcessAgentTurnFromText(
            bundle, step1.NextState, "scusi intendevo una radiologica")

        Assert.Equal("radiologica", ValueSetOps.ScalarValue(
            result.NextState.AcquiredConcepts.First(Function(c) c.Category = "specialità")))
        Assert.Equal("disambiguate", result.Instruction.Action)
        Assert.Equal("esami", result.Instruction.CategoryName)
    End Sub

    <Fact>
    Public Sub ConfirmsRadiologica_WhenScusaVolevoDuringPendingExam()
        Dim bundle = TestBundleFactory.BuildMultiExamBundle()
        TestBundleFactory.AddSpecialitaGrammar(bundle)

        Dim step1 = AgentTurnEngine.ProcessAgentTurn(bundle, AgentTurnEngine.InitAgentSession(), New AgentTurnInput With {
            .IncomingConcepts = New List(Of Concept) From {
                Attr("specialità", "cardiologica"),
                Attr("tipo visita", "prima")
            }
        })

        Dim result = AgentTurnEngine.ProcessAgentTurnFromText(
            bundle, step1.NextState, "scusa volevo una radiologica")

        Assert.Equal("radiologica", ValueSetOps.ScalarValue(
            result.NextState.AcquiredConcepts.First(Function(c) c.Category = "specialità")))
        Assert.Equal("disambiguate", result.Instruction.Action)
    End Sub

    <Fact>
    Public Sub CategoryNegationMatch_DetectsSenzaEcg()
        Dim bundle = TestBundleFactory.BuildSpecialtyCorrectionBundle()
        TestBundleFactory.AddCorrectionTestGrammars(bundle)

        Dim result = CategoryNegationMatch.ExtractFromCorrectionPayload("urologia senza ecg", bundle.Ontology)

        Assert.Contains("ECG", result.NegatedCategories)
        Assert.Contains(result.PositiveConcepts, Function(c) c.Category = "specialità")
    End Sub

    Private Shared Function BuildCardioEcgAcquiredState() As AgentSessionState
        Dim state = AgentTurnEngine.InitAgentSession()
        state.AcquiredConcepts = New List(Of Concept) From {
            Attr("specialità", "cardiologica"),
            Attr("tipo visita", "prima"),
            Attr("ECG", "ecg")
        }
        Return state
    End Function

    <Fact>
    Public Sub ConfirmsUrologia_AfterSpecialtyCorrectionWithLifoRollback()
        Dim bundle = TestBundleFactory.BuildSpecialtyCorrectionBundle()
        TestBundleFactory.AddCorrectionTestGrammars(bundle)

        Dim state = BuildCardioEcgAcquiredState()

        Dim result = AgentTurnEngine.ProcessAgentTurnFromText(
            bundle, state, "mi sono sbagliato intendevo visita urologica")

        Assert.Equal("confirm", result.Instruction.Action)
        Assert.Equal("urologica.prima", result.NextState.SelectedPath)
        Assert.Null(result.NextState.PendingConstraint)
        Assert.False(result.NextState.AcquiredConcepts.Any(Function(c) c.Category = "ECG"))
        Assert.Equal("urologica", ValueSetOps.ScalarValue(
            result.NextState.AcquiredConcepts.First(Function(c) c.Category = "specialità")))
    End Sub

    <Fact>
    Public Sub ConfirmsUrologia_WhenCorrectionUsesExplicitNegation()
        Dim bundle = TestBundleFactory.BuildSpecialtyCorrectionBundle()
        TestBundleFactory.AddCorrectionTestGrammars(bundle)

        Dim state = BuildCardioEcgAcquiredState()

        Dim result = AgentTurnEngine.ProcessAgentTurnFromText(
            bundle, state, "intendevo urologia senza ecg")

        Assert.Equal("confirm", result.Instruction.Action)
        Assert.Equal("urologica.prima", result.NextState.SelectedPath)
        Assert.False(result.NextState.AcquiredConcepts.Any(Function(c) c.Category = "ECG"))
    End Sub

    <Fact>
    Public Sub ClearsPending_WhenCorrectingDuringDisambiguation()
        Dim bundle = TestBundleFactory.BuildOptionalEcgBundle()
        TestBundleFactory.AddSpecialitaGrammar(bundle)

        Dim state = AgentTurnEngine.ProcessAgentTurn(bundle, AgentTurnEngine.InitAgentSession(), New AgentTurnInput With {
            .IncomingConcepts = New List(Of Concept) From {
                Attr("specialità", "cardiologica"),
                Attr("tipo visita", "prima")
            }
        }).NextState

        Assert.NotNull(state.PendingConstraint)
        Assert.Equal("ECG", state.PendingConstraint.CategoryName)

        Dim result = AgentTurnEngine.ProcessAgentTurnFromText(
            bundle, state, "intendevo visita cardiologica senza ecg")

        Assert.Null(result.NextState.PendingConstraint)
        Assert.Equal("confirm", result.Instruction.Action)
        Assert.Equal("cardiologica.prima", result.NextState.SelectedPath)
    End Sub

    <Fact>
    Public Sub NonCorrectionUtterance_UsesExistingDisambiguationFlow()
        Dim bundle = TestBundleFactory.BuildOptionalEcgBundle()

        Dim state = AgentTurnEngine.ProcessAgentTurn(bundle, AgentTurnEngine.InitAgentSession(), New AgentTurnInput With {
            .IncomingConcepts = New List(Of Concept) From {
                Attr("specialità", "cardiologica"),
                Attr("tipo visita", "prima")
            }
        }).NextState

        Dim result = AgentTurnEngine.ProcessAgentTurnFromText(bundle, state, "ecg")

        Assert.Equal("confirm", result.Instruction.Action)
        Assert.Equal("cardiologica.prima.ecg", result.NextState.SelectedPath)
    End Sub

    Private Shared Function Attr(category As String, value As String) As Concept
        Return ValueSetOps.CreateAttributoConcept(category, New List(Of String) From {value})
    End Function

End Class
