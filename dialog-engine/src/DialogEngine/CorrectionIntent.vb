''' <summary>
''' Detects user correction intent (e.g. "mi sono sbagliato", "intendevo") and yields payload text.
''' </summary>
Imports System.Text.RegularExpressions

Public Module CorrectionIntent

    Public Class CorrectionParseResult
        Public Property IsCorrection As Boolean
        Public Property PayloadText As String = String.Empty
    End Class

    Private ReadOnly CorrectionPattern As Regex = New Regex(
        "^\s*(?:no\s*,?\s*)?" &
        "(?:" &
        "(?:mi\s+sono\s+sbagliat[oa]|ho\s+sbagliato|scus(?:ami|a|i|ate)|in\s+realta|correggo)\s*,?\s*(?:(?:intendevo|volevo(?:\s+dire)?)\s+)?" &
        "|(?:(?:intendevo|volevo(?:\s+dire)?)\s+)" &
        ")(?<payload>.+?)\s*$",
        RegexOptions.IgnoreCase Or RegexOptions.CultureInvariant Or RegexOptions.Singleline)

    Private ReadOnly LeadingFillerPattern As Regex = New Regex(
        "^(?:(?:volevo(?:\s+dire)?|intendevo|in\s+realta)\s+|(?:un[oa]?|il|la|lo|l'|i|gli|le)\s+)+",
        RegexOptions.IgnoreCase Or RegexOptions.CultureInvariant)

    ''' <summary>Returns correction payload when utterance expresses a retroactive fix.</summary>
    Public Function TryParse(utterance As String) As CorrectionParseResult
        Dim text = If(utterance, String.Empty).Trim()
        If text.Length = 0 Then
            Return New CorrectionParseResult With {.IsCorrection = False}
        End If

        Dim match = CorrectionPattern.Match(text)
        If Not match.Success Then
            Return New CorrectionParseResult With {.IsCorrection = False}
        End If

        Dim payload = NormalizePayload(If(match.Groups("payload")?.Value, String.Empty))
        If payload.Length = 0 Then
            Return New CorrectionParseResult With {.IsCorrection = False}
        End If

        Return New CorrectionParseResult With {
            .IsCorrection = True,
            .PayloadText = payload
        }
    End Function

    ''' <summary>Strips leading filler words so category grammars can match the corrected value.</summary>
    Public Function NormalizePayload(payload As String) As String
        Dim text = If(payload, String.Empty).Trim()
        If text.Length = 0 Then Return String.Empty

        Dim previous As String
        Do
            previous = text
            text = LeadingFillerPattern.Replace(text, String.Empty).Trim()
        Loop While text.Length > 0 AndAlso Not String.Equals(text, previous, StringComparison.Ordinal)

        Return text
    End Function

End Module
