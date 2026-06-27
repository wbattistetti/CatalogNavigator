''' <summary>
''' Compiles a grammar graph JSON into a single regex + named group mappings.
''' Node synonyms take priority; semantic value synonyms supplement when missing on the node.
''' </summary>
Imports System.Text
Imports System.Text.RegularExpressions
Imports DialogEngine.GrammarGraphModels

Public Module GrammarGraphCompiler

    Private ReadOnly GroupNamePattern As New Regex("^[A-Za-z_][A-Za-z0-9_]*$", RegexOptions.Compiled)

    Public Function CompileToCategoryGrammar(graph As GrammarGraph) As CompiledCategoryGrammar
        If graph Is Nothing Then Throw New ArgumentNullException(NameOf(graph))
        If graph.Nodes Is Nothing OrElse graph.Nodes.Count = 0 Then
            Throw New InvalidOperationException("Grammar graph has no nodes.")
        End If

        Dim nodeById = graph.Nodes.
            Where(Function(n) n IsNot Nothing AndAlso Not String.IsNullOrWhiteSpace(n.Id)).
            GroupBy(Function(n) n.Id, StringComparer.Ordinal).
            ToDictionary(Function(g) g.Key, Function(g) g.First(), StringComparer.Ordinal)

        Dim edges = If(graph.Edges, New List(Of GrammarGraphEdge)())
        Dim incoming = New HashSet(Of String)(StringComparer.Ordinal)
        For Each edge In edges
            If edge Is Nothing OrElse String.IsNullOrWhiteSpace(edge.Target) Then Continue For
            incoming.Add(edge.Target)
        Next

        Dim entryIds = nodeById.Keys.Where(Function(id) Not incoming.Contains(id)).ToList()
        If entryIds.Count = 0 Then
            entryIds.Add(nodeById.Keys.First())
        End If

        Dim mappings As New Dictionary(Of String, String)(StringComparer.OrdinalIgnoreCase)
        Dim entryPatterns As New List(Of String)()
        Dim visiting As New HashSet(Of String)(StringComparer.Ordinal)

        For Each entryId In entryIds
            visiting.Clear()
            Dim pattern = CompileFromNode(graph, nodeById, edges, entryId, mappings, visiting)
            If Not String.IsNullOrWhiteSpace(pattern) Then entryPatterns.Add(pattern)
        Next

        If entryPatterns.Count = 0 Then
            Throw New InvalidOperationException("Grammar graph produced no matchable patterns.")
        End If

        Dim fullPattern = String.Join("|", entryPatterns.Distinct())
        ValidateCompiledRegex(fullPattern, mappings)

        Return New CompiledCategoryGrammar With {
            .Regex = fullPattern,
            .Mappings = mappings
        }
    End Function

    Private Function CompileFromNode(
        graph As GrammarGraph,
        nodeById As Dictionary(Of String, GrammarGraphNode),
        edges As List(Of GrammarGraphEdge),
        nodeId As String,
        mappings As Dictionary(Of String, String),
        visiting As HashSet(Of String)
    ) As String
        If String.IsNullOrWhiteSpace(nodeId) OrElse Not nodeById.ContainsKey(nodeId) Then Return String.Empty
        If Not visiting.Add(nodeId) Then Return String.Empty

        Dim node = nodeById(nodeId)
        Dim selfPattern = CompileNodePattern(graph, node, mappings)
        If String.IsNullOrWhiteSpace(selfPattern) Then
            visiting.Remove(nodeId)
            Return String.Empty
        End If

        Dim outEdges = edges.Where(Function(e) e IsNot Nothing AndAlso String.Equals(e.Source, nodeId, StringComparison.Ordinal)).ToList()
        Dim sequential = outEdges.Where(Function(e) String.Equals(e.Type, "sequential", StringComparison.OrdinalIgnoreCase)).ToList()
        Dim alternative = outEdges.Where(Function(e) String.Equals(e.Type, "alternative", StringComparison.OrdinalIgnoreCase)).ToList()
        Dim optionalEdges = outEdges.Where(Function(e) String.Equals(e.Type, "optional", StringComparison.OrdinalIgnoreCase)).ToList()

        Dim tail As String = String.Empty
        If alternative.Count > 0 Then
            Dim branches As New List(Of String)()
            For Each edge In alternative
                Dim branch = CompileFromNode(graph, nodeById, edges, edge.Target, mappings, visiting)
                If Not String.IsNullOrWhiteSpace(branch) Then branches.Add(branch)
            Next
            If branches.Count > 0 Then tail = "(?:" & String.Join("|", branches) & ")"
        ElseIf sequential.Count > 0 Then
            Dim parts As New List(Of String)()
            For Each edge In sequential
                Dim nextPart = CompileFromNode(graph, nodeById, edges, edge.Target, mappings, visiting)
                If Not String.IsNullOrWhiteSpace(nextPart) Then parts.Add(nextPart)
            Next
            If parts.Count > 0 Then tail = String.Join("\s+", parts)
        End If

        For Each edge In optionalEdges
            Dim optPart = CompileFromNode(graph, nodeById, edges, edge.Target, mappings, visiting)
            If Not String.IsNullOrWhiteSpace(optPart) Then
                tail = If(String.IsNullOrWhiteSpace(tail), optPart, tail & "(?:" & optPart & ")?")
            End If
        Next

        visiting.Remove(nodeId)

        Dim combined = selfPattern
        If Not String.IsNullOrWhiteSpace(tail) Then
            combined &= If(alternative.Count > 0 OrElse optionalEdges.Count > 0, tail, "\s+" & tail)
        End If

        If node.IsOptional Then combined = "(?:" & combined & ")?"
        If node.Repeatable Then combined = "(?:" & combined & ")+"

        Return combined
    End Function

    Private Function CompileNodePattern(
        graph As GrammarGraph,
        node As GrammarGraphNode,
        mappings As Dictionary(Of String, String)
    ) As String
        If node Is Nothing Then Return String.Empty

        Dim bindings = If(node.Bindings, New List(Of NodeBinding)())
        Dim valueBinding = bindings.FirstOrDefault(Function(b) b IsNot Nothing AndAlso String.Equals(b.Type, "semantic-value", StringComparison.OrdinalIgnoreCase))
        Dim setBinding = bindings.FirstOrDefault(Function(b) b IsNot Nothing AndAlso String.Equals(b.Type, "semantic-set", StringComparison.OrdinalIgnoreCase))

        If valueBinding IsNot Nothing AndAlso Not String.IsNullOrWhiteSpace(valueBinding.ValueId) Then
            Dim value = FindSemanticValue(graph, valueBinding.ValueId)
            If value Is Nothing Then Throw New InvalidOperationException($"Unknown semantic value id '{valueBinding.ValueId}'.")
            Return BuildNamedValuePattern(node, value, mappings)
        End If

        If setBinding IsNot Nothing AndAlso Not String.IsNullOrWhiteSpace(setBinding.SetId) Then
            Dim semanticSet = FindSemanticSet(graph, setBinding.SetId)
            If semanticSet Is Nothing Then Throw New InvalidOperationException($"Unknown semantic set id '{setBinding.SetId}'.")
            Dim parts As New List(Of String)()
            For Each value In If(semanticSet.Values, New List(Of SemanticValue)())
                If value Is Nothing Then Continue For
                parts.Add(BuildNamedValuePattern(node, value, mappings))
            Next
            If parts.Count = 0 Then Return String.Empty
            Return "(?:" & String.Join("|", parts) & ")"
        End If

        If Not String.IsNullOrWhiteSpace(node.Regex) Then Return "(?:" & node.Regex.Trim() & ")"

        Dim words = CollectNodeWords(node, Nothing)
        If words.Count = 0 Then Return String.Empty
        Return "(?:" & JoinWordAlternation(words) & ")"
    End Function

    Private Function BuildNamedValuePattern(
        node As GrammarGraphNode,
        value As SemanticValue,
        mappings As Dictionary(Of String, String)
    ) As String
        If Not String.IsNullOrWhiteSpace(value.Regex) Then
            Dim groupName = AllocateGroupName(SanitizeGroupName(value.Value), mappings)
            mappings(groupName) = value.Value.Trim()
            Return "(?<" & groupName & ">" & value.Regex.Trim() & ")"
        End If

        Dim words = CollectNodeWords(node, value)
        If words.Count = 0 Then Return String.Empty
        Dim namedGroup = AllocateGroupName(SanitizeGroupName(value.Value), mappings)
        mappings(namedGroup) = value.Value.Trim()
        Return "(?<" & namedGroup & ">" & JoinWordAlternation(words) & ")"
    End Function

    Friend Function CollectNodeWords(node As GrammarGraphNode, value As SemanticValue) As List(Of String)
        Dim seen As New HashSet(Of String)(StringComparer.OrdinalIgnoreCase)
        Dim words As New List(Of String)()

        Dim addWord = Sub(raw As String)
                          Dim t = If(raw, String.Empty).Trim()
                          If t.Length = 0 Then Return
                          Dim key = t.ToLowerInvariant()
                          If seen.Add(key) Then words.Add(t)
                      End Sub

        addWord(node.Label)
        For Each synonym In If(node.Synonyms, New List(Of String)())
            addWord(synonym)
        Next

        If value IsNot Nothing Then
            addWord(value.Value)
            For Each synonym In If(value.Synonyms, New List(Of String)())
                addWord(synonym)
            Next
        End If

        Return words
    End Function

    Friend Function JoinWordAlternation(words As IEnumerable(Of String)) As String
        Return String.Join("|", words.Select(Function(w) EscapeRegexLiteral(w)))
    End Function

    Friend Function EscapeRegexLiteral(value As String) As String
        If value Is Nothing Then Return String.Empty
        Dim sb As New StringBuilder()
        For Each ch In value
            Select Case ch
                Case "\"c, "."c, "+"c, "*"c, "?"c, "|"c, "("c, ")"c, "["c, "]"c, "{"c, "}"c, "^"c, "$"
                    sb.Append("\"c).Append(ch)
                Case Else
                    sb.Append(ch)
            End Select
        Next
        Return sb.ToString()
    End Function

    Friend Function SanitizeGroupName(raw As String) As String
        Dim trimmed = If(raw, String.Empty).Trim()
        If trimmed.Length = 0 Then Return "valore"
        Dim sb As New StringBuilder()
        For Each ch In trimmed
            If Char.IsLetterOrDigit(ch) OrElse ch = "_"c Then
                sb.Append(ch)
            ElseIf ch = "+"c OrElse ch = "-"c OrElse ch = "."c Then
                sb.Append("_"c)
            Else
                sb.Append("_"c)
            End If
        Next
        Dim name = sb.ToString().Trim("_"c)
        If name.Length = 0 Then name = "valore"
        If Char.IsDigit(name(0)) Then name = "v_" & name
        Return name
    End Function

    Private Function AllocateGroupName(baseName As String, mappings As Dictionary(Of String, String)) As String
        Dim candidate = baseName
        Dim suffix = 0
        While mappings.ContainsKey(candidate)
            candidate = baseName & "_" & suffix.ToString()
            suffix += 1
        End While
        Return candidate
    End Function

    Private Function FindSemanticSet(graph As GrammarGraph, setId As String) As SemanticSet
        Return If(graph.SemanticSets, New List(Of SemanticSet)()).
            FirstOrDefault(Function(s) s IsNot Nothing AndAlso String.Equals(s.Id, setId, StringComparison.Ordinal))
    End Function

    Private Function FindSemanticValue(graph As GrammarGraph, valueId As String) As SemanticValue
        For Each semanticSet In If(graph.SemanticSets, New List(Of SemanticSet)())
            If semanticSet?.Values Is Nothing Then Continue For
            Dim found = semanticSet.Values.FirstOrDefault(Function(v) v IsNot Nothing AndAlso String.Equals(v.Id, valueId, StringComparison.Ordinal))
            If found IsNot Nothing Then Return found
        Next
        Return Nothing
    End Function

    Private Sub ValidateCompiledRegex(pattern As String, mappings As Dictionary(Of String, String))
        If String.IsNullOrWhiteSpace(pattern) Then
            Throw New InvalidOperationException("Compiled grammar regex is empty.")
        End If
        Try
            Dim re As New Regex(pattern, RegexOptions.IgnoreCase Or RegexOptions.CultureInvariant)
            For Each groupName In mappings.Keys
                If Not GroupNamePattern.IsMatch(groupName) Then
                    Throw New InvalidOperationException($"Invalid regex group name '{groupName}'.")
                End If
            Next
        Catch ex As Exception
            Throw New InvalidOperationException("Compiled grammar regex is invalid: " & ex.Message, ex)
        End Try
    End Sub

End Module
