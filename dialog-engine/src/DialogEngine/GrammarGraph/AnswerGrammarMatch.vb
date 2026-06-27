''' <summary>
''' Matches utterances against compiled answer grammars (regex + mappings or grammar graph).
''' </summary>
Imports System.Collections.Concurrent
Imports System.Text.RegularExpressions
Imports DialogEngine.GrammarGraphModels

Public Module AnswerGrammarMatch

    Private ReadOnly CompiledGraphCache As New ConcurrentDictionary(Of String, CompiledCategoryGrammar)(StringComparer.Ordinal)

    Public Function CompileGraphCached(graph As GrammarGraph) As CompiledCategoryGrammar
        Return CompileGraphCached(graph, Nothing)
    End Function

    Public Function CompileGraphCached(graph As GrammarGraph, explicitCacheKey As String) As CompiledCategoryGrammar
        Dim key = If(String.IsNullOrWhiteSpace(explicitCacheKey), BuildGraphCacheKey(graph), explicitCacheKey)
        Return CompiledGraphCache.GetOrAdd(key, Function(unused As String) GrammarGraphCompiler.CompileToCategoryGrammar(graph))
    End Function

    Public Function BuildGraphCacheKey(graph As GrammarGraph) As String
        If graph Is Nothing Then Return String.Empty
        Dim nodePart = String.Join("|", If(graph.Nodes, New List(Of GrammarGraphNode)()).Select(
            Function(n) $"{n?.Id}:{n?.Label}:{String.Join(",", If(n?.Synonyms, New List(Of String)()))}"))
        Dim edgePart = String.Join("|", If(graph.Edges, New List(Of GrammarGraphEdge)()).Select(
            Function(e) $"{e?.Source}>{e?.Target}:{e?.Type}"))
        Return $"{graph.Id}|{nodePart}|{edgePart}"
    End Function

    Public Function MatchCategoryGrammar(text As String, grammar As Models.CategoryGrammar) As AnswerGrammarMatchResult
        Dim result As New AnswerGrammarMatchResult()
        If grammar Is Nothing OrElse String.IsNullOrWhiteSpace(grammar.Regex) Then Return result

        Dim trimmed = If(text, String.Empty).Trim().ToLowerInvariant()
        If trimmed.Length = 0 Then Return result

        Try
            Dim match = Regex.Match(trimmed, grammar.Regex, RegexOptions.IgnoreCase Or RegexOptions.CultureInvariant)
            If Not match.Success Then Return result

            Dim bestCanonical As String = Nothing
            Dim bestLength = -1
            Dim allMatches As New List(Of String)()

            If grammar.Mappings IsNot Nothing Then
                For Each groupName In grammar.Mappings.Keys
                    Dim group = match.Groups(groupName)
                    If Not group.Success OrElse String.IsNullOrEmpty(group.Value) Then Continue For
                    Dim mapped = grammar.Mappings(groupName)
                    If String.IsNullOrWhiteSpace(mapped) Then Continue For
                    If Not allMatches.Any(Function(m) String.Equals(m, mapped, StringComparison.OrdinalIgnoreCase)) Then
                        allMatches.Add(mapped)
                    End If
                    If group.Value.Length > bestLength Then
                        bestLength = group.Value.Length
                        bestCanonical = mapped
                    End If
                Next
            End If

            result.MatchedOption = bestCanonical
            result.MatchedOptions = allMatches
            Return result
        Catch ex As Exception
            result.CompileError = ex.Message
            Return result
        End Try
    End Function

    Public Function MatchGrammarGraph(text As String, graph As GrammarGraph) As AnswerGrammarMatchResult
        Try
            Dim compiled = CompileGraphCached(graph)
            Dim categoryGrammar = New Models.CategoryGrammar With {
                .Regex = compiled.Regex,
                .Mappings = compiled.Mappings
            }
            Return MatchCategoryGrammar(text, categoryGrammar)
        Catch ex As Exception
            Return New AnswerGrammarMatchResult With {.CompileError = ex.Message}
        End Try
    End Function

    Public Function MatchAllOptionsIndependently(text As String, graph As GrammarGraph) As AnswerGrammarMatchResult
        Dim result As New AnswerGrammarMatchResult()
        If graph Is Nothing Then Return result

        Try
            Dim allMatches As New List(Of String)()
            For Each semanticSet In If(graph.SemanticSets, New List(Of SemanticSet)())
                For Each value In If(semanticSet?.Values, New List(Of SemanticValue)())
                    If value Is Nothing Then Continue For
                    Dim node = graph.Nodes?.FirstOrDefault(
                        Function(n) n?.Bindings?.Any(
                            Function(b) b IsNot Nothing AndAlso
                                String.Equals(b.Type, "semantic-value", StringComparison.OrdinalIgnoreCase) AndAlso
                                String.Equals(b.ValueId, value.Id, StringComparison.Ordinal)) = True)
                    Dim miniGraph = BuildSingleValueGraph(graph, value, node)
                    Dim match = MatchGrammarGraph(text, miniGraph)
                    If Not String.IsNullOrWhiteSpace(match.MatchedOption) AndAlso
                        Not allMatches.Any(Function(m) String.Equals(m, match.MatchedOption, StringComparison.OrdinalIgnoreCase)) Then
                        allMatches.Add(match.MatchedOption)
                    End If
                Next
            Next

            result.MatchedOptions = allMatches
            If allMatches.Count = 1 Then result.MatchedOption = allMatches(0)
            Return result
        Catch ex As Exception
            result.CompileError = ex.Message
            Return result
        End Try
    End Function

    Private Function BuildSingleValueGraph(
        source As GrammarGraph,
        value As SemanticValue,
        node As GrammarGraphNode
    ) As GrammarGraph
        Dim miniNode As New GrammarGraphNode With {
            .Id = If(node?.Id, "probe"),
            .Label = If(node?.Label, value.Value),
            .Synonyms = If(node?.Synonyms, New List(Of String)()),
            .Bindings = New List(Of NodeBinding) From {
                New NodeBinding With {.Type = "semantic-value", .ValueId = value.Id}
            }
        }
        Return New GrammarGraph With {
            .Id = "probe",
            .Name = "probe",
            .Nodes = New List(Of GrammarGraphNode) From {miniNode},
            .Edges = New List(Of GrammarGraphEdge)(),
            .SemanticSets = source.SemanticSets
        }
    End Function

End Module
