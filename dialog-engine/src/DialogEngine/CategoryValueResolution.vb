''' <summary>
''' Resolves attributo values per category cardinality and winner override.
''' </summary>
Public Module CategoryValueResolution

    Public Const CardinalitySingle As String = "single"
    Public Const CardinalityMulti As String = "multi"

    Public Function NormalizeCardinality(cardinality As String) As String
        If String.Equals(cardinality, CardinalityMulti, StringComparison.OrdinalIgnoreCase) Then
            Return CardinalityMulti
        End If
        Return CardinalitySingle
    End Function

    Public Function IsMultiCardinality(category As Models.CategoryDefinition) As Boolean
        If category Is Nothing Then Return False
        Return String.Equals(
            NormalizeCardinality(category.Cardinality),
            CardinalityMulti,
            StringComparison.OrdinalIgnoreCase)
    End Function

    ''' <summary>
    ''' Resolves attributo values: multi keeps all; single applies winner or returns unresolved list.
    ''' </summary>
    Public Function ResolveAttributoValues(
        category As Models.CategoryDefinition,
        rawValues As IEnumerable(Of String)
    ) As List(Of String)
        Dim normalized = ValueSetOps.NormalizeAttributoValues(rawValues)
        If normalized.Count = 0 Then Return normalized
        If category Is Nothing Then Return normalized

        If category.Kind = Models.ConceptKind.Vincolo Then
            Return New List(Of String) From {normalized(0)}
        End If

        If IsMultiCardinality(category) Then Return normalized
        If normalized.Count = 1 Then Return normalized

        Dim winner = category.Winner?.Trim()
        If Not String.IsNullOrWhiteSpace(winner) Then
            Dim match = normalized.FirstOrDefault(
                Function(v) String.Equals(v, winner, StringComparison.OrdinalIgnoreCase))
            If match IsNot Nothing Then Return New List(Of String) From {match}
        End If

        Return normalized
    End Function

    Public Function HasCardinalityConflict(
        category As Models.CategoryDefinition,
        rawValues As IEnumerable(Of String)
    ) As Boolean
        If category Is Nothing Then Return False
        If category.Kind = Models.ConceptKind.Vincolo Then Return False
        If IsMultiCardinality(category) Then Return False

        Dim normalized = ValueSetOps.NormalizeAttributoValues(rawValues)
        If normalized.Count <= 1 Then Return False

        Dim winner = category.Winner?.Trim()
        If String.IsNullOrWhiteSpace(winner) Then Return True

        Return Not normalized.Any(
            Function(v) String.Equals(v, winner, StringComparison.OrdinalIgnoreCase))
    End Function

End Module
