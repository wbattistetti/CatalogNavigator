Imports DialogEngine.Models
Imports Xunit

Public Class AgentTurnEngineTests

    <Fact>
    Public Sub AsksAge_WhenSlotsMatchMultipleAgeVincoloItems()
        Dim bundle = TestBundleFactory.BuildCardioBundle()
        Dim result = AgentTurnEngine.ProcessAgentTurn(bundle, AgentTurnEngine.InitAgentSession(), New AgentTurnInput With {
            .IncomingConcepts = New List(Of Concept) From {
                New Concept With {.Category = "SPECIALITÀ", .Value = "cardiologica"},
                New Concept With {.Category = "TIPO VISITA", .Value = "prima"}
            }
        })
        Assert.Equal("ask_age", result.Instruction.Action)
        Assert.Equal(ConstraintValidation.AgeYearsQuestion, result.SpokenHint)
        Assert.Equal(2, result.CandidateCount)
    End Sub

    <Fact>
    Public Sub ConfirmsAdultItem_AfterAgeSlot()
        Dim bundle = TestBundleFactory.BuildCardioBundle()
        Dim state = AgentTurnEngine.InitAgentSession()
        state = AgentTurnEngine.ProcessAgentTurn(bundle, state, New AgentTurnInput With {
            .IncomingConcepts = New List(Of Concept) From {
                New Concept With {.Category = "SPECIALITÀ", .Value = "cardiologica"},
                New Concept With {.Category = "TIPO VISITA", .Value = "prima"}
            }
        }).NextState
        Dim result = AgentTurnEngine.ProcessAgentTurn(bundle, state, New AgentTurnInput With {
            .IncomingConcepts = New List(Of Concept) From {
                New Concept With {.Category = "FASCIA DI ETÀ (VINCOLO)", .Value = "30"}
            }
        })
        Assert.Equal("confirm", result.Instruction.Action)
        Assert.Contains("adulto", result.NextState.SelectedPath)
        Assert.Equal(30, ConceptOps.FindAcquiredAgeYears(result.NextState.AcquiredConcepts))
        Assert.Contains("Visita cardiologica adulta", result.SpokenHint)
    End Sub

    <Fact>
    Public Sub Disambiguates_OnFirstCategoryWithTwoDistinctValues()
        Dim bundle = TestBundleFactory.BuildTargetOnlyBundle()
        Dim result = AgentTurnEngine.ProcessAgentTurn(bundle, AgentTurnEngine.InitAgentSession(), New AgentTurnInput With {
            .IncomingConcepts = New List(Of Concept) From {
                New Concept With {.Category = "SPECIALITÀ", .Value = "cardiologica"}
            }
        })
        Assert.Equal("disambiguate", result.Instruction.Action)
        Assert.Contains("target", result.Instruction.CategoryName.ToLowerInvariant())
        Assert.Equal(New List(Of String) From {"adulto", "pediatrica"}, result.Instruction.Options)
        Assert.Contains("adulto", result.SpokenHint)
        Assert.Contains("pediatrica", result.SpokenHint)
    End Sub

    <Fact>
    Public Sub AskAge_IncludesExpectedInputContract()
        Dim bundle = TestBundleFactory.BuildCardioBundle()
        Dim result = AgentTurnEngine.ProcessAgentTurn(bundle, AgentTurnEngine.InitAgentSession(), New AgentTurnInput With {
            .IncomingConcepts = New List(Of Concept) From {
                New Concept With {.Category = "SPECIALITÀ", .Value = "cardiologica"},
                New Concept With {.Category = "TIPO VISITA", .Value = "prima"}
            }
        })
        Assert.Equal("age_years", result.Instruction.ExpectedConstraints(0).ValueKind)
    End Sub

    <Fact>
    Public Sub ProcessFromText_ExtractsSpecialitaAndDisambiguates()
        Dim bundle = TestBundleFactory.BuildTargetOnlyBundle()
        TestBundleFactory.AddSpecialitaGrammar(bundle)
        Dim result = AgentTurnEngine.ProcessAgentTurnFromText(
            bundle,
            AgentTurnEngine.InitAgentSession(),
            "visita cardiologica"
        )
        Assert.Equal("disambiguate", result.Instruction.Action)
        Assert.NotEqual(bundle.Ontology.StartQuestion, result.SpokenHint)
    End Sub

    <Fact>
    Public Sub ProcessFromText_ConfirmsAdult_AfterBareAgeWhilePendingVincolo()
        Dim bundle = TestBundleFactory.BuildCardioBundle()
        TestBundleFactory.AddSpecialitaGrammar(bundle)
        Dim state = AgentTurnEngine.ProcessAgentTurnFromText(
            bundle,
            AgentTurnEngine.InitAgentSession(),
            "cardiologica"
        ).NextState
        Assert.NotNull(state.PendingConstraint)
        Assert.Equal("age_years", state.PendingConstraint.ValueKind)
        Dim result = AgentTurnEngine.ProcessAgentTurnFromText(bundle, state, "18")
        Assert.Equal("confirm", result.Instruction.Action)
        Assert.Equal(18, ConceptOps.FindAcquiredAgeYears(result.NextState.AcquiredConcepts))
        Assert.Contains("adulto", result.NextState.SelectedPath)
        Assert.Contains("Visita cardiologica adulta", result.SpokenHint)
    End Sub

    <Fact>
    Public Sub ProcessFromText_ConfirmsAdult_WhenAgeAndSpecialtyInSameUtterance()
        Dim bundle = TestBundleFactory.BuildCardioBundle()
        TestBundleFactory.AddSpecialitaGrammar(bundle)
        TestBundleFactory.AddAgeVincoloResolution(bundle)
        Dim result = AgentTurnEngine.ProcessAgentTurnFromText(
            bundle,
            AgentTurnEngine.InitAgentSession(),
            "visita cardiologica mio figlio ha venti anni"
        )
        Assert.Equal("confirm", result.Instruction.Action)
        Assert.Contains("adulto", result.NextState.SelectedPath)
        Assert.Equal(20, ConceptOps.FindAcquiredAgeYears(result.NextState.AcquiredConcepts))
    End Sub

    <Fact>
    Public Sub HttpResponse_BuildsWebhookPayload()
        Dim bundle = TestBundleFactory.BuildTargetOnlyBundle()
        Dim turn = AgentTurnEngine.ProcessAgentTurn(bundle, AgentTurnEngine.InitAgentSession(), New AgentTurnInput With {
            .IncomingConcepts = New List(Of Concept) From {
                New Concept With {.Category = "specialità", .Value = "cardiologica"}
            }
        })
        Dim http = HttpResponseBuilder.BuildAgentDialogStepHttpResponse("conv-1", "doc-1", turn)
        Assert.True(http.Ok)
        Assert.Equal("disambiguate", http.Instruction.Action)
        Assert.False(String.IsNullOrEmpty(http.SpokenHint))
        Assert.Contains("DISAMBIGUATE", http.Debug.Log)
    End Sub

End Class
