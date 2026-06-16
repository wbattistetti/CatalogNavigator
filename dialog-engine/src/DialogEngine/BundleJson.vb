''' <summary>
''' Loads and saves AgentBundle JSON (VB-native ontology + catalog format).
''' </summary>
Imports System.Text.Json
Imports System.Text.Json.Serialization

Public Module BundleJson

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

    Public Function LoadBundle(json As String) As Models.AgentBundle
        If String.IsNullOrWhiteSpace(json) Then
            Throw New ArgumentException("Bundle JSON is required.", NameOf(json))
        End If
        Dim bundle = JsonSerializer.Deserialize(Of Models.AgentBundle)(json, Options)
        If bundle Is Nothing Then
            Throw New InvalidOperationException("Failed to deserialize AgentBundle JSON.")
        End If
        Return bundle
    End Function

    Public Function SaveBundle(bundle As Models.AgentBundle) As String
        Return JsonSerializer.Serialize(bundle, Options)
    End Function

End Module
