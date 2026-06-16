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

        If state.AcquiredConcepts Is Nothing OrElse state.AcquiredConcepts.Count = 0 Then
            Dim migrated = MigrateLegacySession(root)
            If migrated.Count > 0 Then state.AcquiredConcepts = migrated
        End If

        If state.AcquiredConcepts Is Nothing Then
            state.AcquiredConcepts = New List(Of Models.Concept)()
        End If

        Return state
    End Function

    Private Function MigrateLegacySession(root As JsonElement) As List(Of Models.Concept)
        Dim concepts As New List(Of Models.Concept)()
        Dim legacyDict As JsonElement

        If root.TryGetProperty("resolvedConcepts", legacyDict) OrElse
           root.TryGetProperty("resolvedSlots", legacyDict) Then
            If legacyDict.ValueKind = JsonValueKind.Object Then
                For Each prop In legacyDict.EnumerateObject()
                    If String.IsNullOrWhiteSpace(prop.Name) OrElse prop.Value.ValueKind <> JsonValueKind.String Then Continue For
                    Dim value = prop.Value.GetString()
                    If String.IsNullOrWhiteSpace(value) Then Continue For
                    Dim kind = If(CategoryNormalization.IsAgeCategoryKey(prop.Name), "vincolo", "attributo")
                    concepts.Add(New Models.Concept With {
                        .Category = prop.Name,
                        .Value = value.Trim(),
                        .Kind = kind,
                        .Unit = If(kind = "vincolo", "years", Nothing)
                    })
                Next
            End If
        End If

        Return concepts
    End Function

    Public Function SerializeTurnResult(result As Models.AgentTurnResult) As String
        Return JsonSerializer.Serialize(result, Options)
    End Function

End Module
