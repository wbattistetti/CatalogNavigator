''' <summary>
''' Data contracts for design-time grammar graphs (nodes, edges, semantic sets).
''' </summary>
Imports System.Text.Json.Serialization

Namespace GrammarGraphModels

    Public Class GrammarGraphMetadata
        Public Property CreatedAt As Long
        Public Property UpdatedAt As Long
        Public Property Version As String
    End Class

    Public Class SemanticValue
        Public Property Id As String
        Public Property Value As String
        Public Property Synonyms As List(Of String) = New List(Of String)()
        Public Property Regex As String
    End Class

    Public Class SemanticSet
        Public Property Id As String
        Public Property Name As String
        Public Property Values As List(Of SemanticValue) = New List(Of SemanticValue)()
    End Class

    Public Class NodeBinding
        Public Property Type As String
        Public Property SlotId As String
        Public Property SetId As String
        Public Property ValueId As String
    End Class

    Public Class GrammarGraphNode
        Public Property Id As String
        Public Property Label As String
        Public Property Synonyms As List(Of String) = New List(Of String)()
        Public Property Regex As String
        Public Property Bindings As List(Of NodeBinding) = New List(Of NodeBinding)()
        <JsonPropertyName("optional")>
        Public Property IsOptional As Boolean
        Public Property Repeatable As Boolean
        Public Property Position As GrammarGraphPosition
    End Class

    Public Class GrammarGraphPosition
        Public Property X As Double
        Public Property Y As Double
    End Class

    Public Class GrammarGraphEdge
        Public Property Id As String
        Public Property Source As String
        Public Property Target As String
        ''' <summary>sequential | alternative | optional</summary>
        Public Property Type As String
        Public Property Label As String
    End Class

    Public Class GrammarGraph
        Public Property Id As String
        Public Property Name As String
        Public Property Nodes As List(Of GrammarGraphNode) = New List(Of GrammarGraphNode)()
        Public Property Edges As List(Of GrammarGraphEdge) = New List(Of GrammarGraphEdge)()
        Public Property SemanticSets As List(Of SemanticSet) = New List(Of SemanticSet)()
        Public Property Metadata As GrammarGraphMetadata
    End Class

    Public Class CompiledCategoryGrammar
        Public Property Regex As String
        Public Property Mappings As Dictionary(Of String, String) = New Dictionary(Of String, String)(StringComparer.OrdinalIgnoreCase)
    End Class

    Public Class AnswerGrammarMatchResult
        Public Property MatchedOption As String
        Public Property MatchedOptions As List(Of String) = New List(Of String)()
        Public Property CompileError As String
    End Class

End Namespace
