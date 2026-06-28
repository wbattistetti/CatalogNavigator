''' <summary>
''' JSON helpers for HTTP API (session state + turn result serialization).
''' </summary>
Imports System.Text.Json
Imports System.Text.Json.Serialization

Public Module TurnJson

    Private ReadOnly Options As JsonSerializerOptions = CreateOptions()

    Private Function CreateOptions() As JsonSerializerOptions
        Dim opts As New JsonSerializerOptions With {
            .PropertyNameCaseInsensitive = True,
            .PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
            .DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
        }
        opts.Converters.Add(New JsonStringEnumConverter(JsonNamingPolicy.CamelCase))
        Return opts
    End Function

    Public Function LoadSessionState(json As String) As Models.AgentSessionState
        If String.IsNullOrWhiteSpace(json) Then
            Return AgentTurnEngine.InitAgentSession()
        End If

        Using doc = JsonDocument.Parse(json)
            Return LoadSessionState(doc.RootElement)
        End Using
    End Function

    Public Function LoadSessionState(root As JsonElement) As Models.AgentSessionState
        Dim state = JsonSerializer.Deserialize(Of Models.AgentSessionState)(root.GetRawText(), Options)
        If state Is Nothing Then Return AgentTurnEngine.InitAgentSession()

        If state.AcquiredConcepts Is Nothing Then
            state.AcquiredConcepts = New List(Of Models.Concept)()
        Else
            state.AcquiredConcepts = state.AcquiredConcepts.
                Select(AddressOf NormalizeLoadedConcept).
                Where(Function(c) c IsNot Nothing).
                ToList()
        End If

        If state.ExactAttributoCategories Is Nothing Then
            state.ExactAttributoCategories = New List(Of String)()
        End If

        Return state
    End Function

    Private Function NormalizeLoadedConcept(concept As Models.Concept) As Models.Concept
        If concept Is Nothing Then Return Nothing
        If concept.Values Is Nothing OrElse concept.Values.Count = 0 Then Return Nothing
        Return New Models.Concept With {
            .Category = concept.Category,
            .Values = ValueSetOps.NormalizeAttributoValues(concept.Values),
            .Kind = concept.Kind,
            .Unit = concept.Unit
        }
    End Function

    Public Function SerializeTurnResult(result As Models.AgentTurnResult) As String
        Return JsonSerializer.Serialize(result, Options)
    End Function

End Module
