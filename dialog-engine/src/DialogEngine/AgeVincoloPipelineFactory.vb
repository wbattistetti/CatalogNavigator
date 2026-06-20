''' <summary>
''' Builds age vincolo resolution pipeline v1 (mirrors compileAgeVincoloResolutionPipeline in TypeScript).
''' </summary>
Imports System.Text
Imports System.Text.RegularExpressions
Imports System.Globalization

Public Module AgeVincoloPipelineFactory

    Private ReadOnly UnitMap As Dictionary(Of String, String) = New Dictionary(Of String, String) From {
        {"anno", "years"}, {"anni", "years"},
        {"mese", "months"}, {"mesi", "months"},
        {"settimana", "weeks"}, {"settimane", "weeks"},
        {"giorno", "days"}, {"giorni", "days"}
    }

    Public Function BuildPipeline() As Models.ResolutionPipeline
        Dim lexicon = BuildItalianAgeWordLexicon()
        Dim wordUnitLexicon = BuildWordUnitLexicon(lexicon)
        Dim wordAlt = BuildAgeWordAlternation(wordUnitLexicon)
        Dim wordEntries = BuildWordMapEntries(lexicon)

        Return New Models.ResolutionPipeline With {
            .Engine = "pipeline",
            .Version = 1,
            .ValueKind = "age_years",
            .Steps = New List(Of Models.ResolutionStep) From {
                New Models.ResolutionStep With {
                    .Type = "regex_capture",
                    .Pattern = "(?:^|\s)(\d{1,3})\s*(anni|anno|mesi|mese|giorni|giorno|settimane|settimana)\b",
                    .ValueGroup = 1,
                    .UnitGroup = 2,
                    .UnitMap = UnitMap
                },
                New Models.ResolutionStep With {
                    .Type = "regex_capture",
                    .Pattern = "(?:ho|ha|sono|è|e|di)\s+(\d{1,3})(?:\s*(anni|anno|mesi|mese|giorni|giorno|settimane|settimana))?\b",
                    .ValueGroup = 1,
                    .UnitGroup = 2,
                    .UnitMap = UnitMap,
                    .DefaultUnit = "years"
                },
                New Models.ResolutionStep With {
                    .Type = "word_unit_capture",
                    .Pattern = $"(?:^|\s|(?:ho|ha|sono|è|e|di)\s+)({wordAlt})\s+(anni|anno|mesi|mese|giorni|giorno|settimane|settimana)\b",
                    .WordGroup = 1,
                    .UnitGroup = 2,
                    .WordValueMap = wordUnitLexicon,
                    .UnitMap = UnitMap
                },
                New Models.ResolutionStep With {
                    .Type = "word_map",
                    .Entries = wordEntries
                },
                New Models.ResolutionStep With {
                    .Type = "bare_number",
                    .Pattern = "^\d{1,3}$",
                    .DefaultUnit = "years"
                }
            }
        }
    End Function

    Public Function BuildItalianAgeWordLexicon() As Dictionary(Of String, Integer)
        Dim lexicon As New Dictionary(Of String, Integer)(StringComparer.OrdinalIgnoreCase)

        AddWords(lexicon, New Dictionary(Of String, Integer) From {
            {"zero", 0}, {"due", 2}, {"tre", 3}, {"quattro", 4},
            {"cinque", 5}, {"sei", 6}, {"sette", 7}, {"otto", 8}, {"nove", 9},
            {"dieci", 10}, {"undici", 11}, {"dodici", 12}, {"tredici", 13}, {"quattordici", 14},
            {"quindici", 15}, {"sedici", 16}, {"diciassette", 17}, {"diciotto", 18}, {"diciannove", 19},
            {"venti", 20}, {"trenta", 30}, {"quaranta", 40}, {"cinquanta", 50}, {"sessanta", 60},
            {"settanta", 70}, {"ottanta", 80}, {"novanta", 90}, {"cento", 100}
        })

        Dim tens = New (Word As String, Base As Integer)() {
            ("venti", 20), ("trenta", 30), ("quaranta", 40), ("cinquanta", 50),
            ("sessanta", 60), ("settanta", 70), ("ottanta", 80), ("novanta", 90)
        }
        Dim ones = New (Word As String, Value As Integer)() {
            ("uno", 1), ("due", 2), ("tre", 3), ("quattro", 4), ("cinque", 5),
            ("sei", 6), ("sette", 7), ("otto", 8), ("nove", 9)
        }

        For Each tensPart In tens
            For Each onesPart In ones
                Dim word = BuildItalianCompoundWord(tensPart.Word, onesPart.Word)
                lexicon(word) = tensPart.Base + onesPart.Value
                If onesPart.Word = "tre" Then
                    lexicon(StripCombiningMarks(word)) = tensPart.Base + onesPart.Value
                End If
            Next
        Next

        Return lexicon
    End Function

    Private ReadOnly AmbiguousStandaloneAgeWords As HashSet(Of String) = New HashSet(Of String)(
        New String() {"un", "uno", "una"},
        StringComparer.OrdinalIgnoreCase)

    Private Function BuildWordUnitLexicon(base As Dictionary(Of String, Integer)) As Dictionary(Of String, Integer)
        Dim merged As New Dictionary(Of String, Integer)(base, StringComparer.OrdinalIgnoreCase)
        merged("un") = 1
        Return merged
    End Function

    Private Function BuildWordMapEntries(lexicon As Dictionary(Of String, Integer)) As List(Of Models.WordMapEntry)
        Return lexicon.
            Where(Function(kvp) Not AmbiguousStandaloneAgeWords.Contains(kvp.Key)).
            Select(Function(kvp) New Models.WordMapEntry With {
                .Word = kvp.Key,
                .Value = kvp.Value,
                .Unit = "years"
            }).ToList()
    End Function

    Private Function BuildItalianCompoundWord(tensWord As String, onesWord As String) As String
        If tensWord = "venti" Then
            If onesWord = "uno" Then Return "ventuno"
            If onesWord = "otto" Then Return "ventotto"
            If onesWord = "tre" Then Return "ventitré"
            Return tensWord & onesWord
        End If
        If tensWord.EndsWith("a", StringComparison.Ordinal) Then
            Dim stem = tensWord.Substring(0, tensWord.Length - 1)
            If onesWord = "uno" Then Return stem & "uno"
            If onesWord = "otto" Then Return stem & "otto"
            If onesWord = "tre" Then Return stem & "atré"
            Return tensWord & onesWord
        End If
        Return tensWord & onesWord
    End Function

    Private Function StripCombiningMarks(value As String) As String
        Dim normalized = value.Normalize(NormalizationForm.FormD)
        Dim builder As New StringBuilder()
        For Each ch In normalized
            If CharUnicodeInfo.GetUnicodeCategory(ch) <> UnicodeCategory.NonSpacingMark Then
                builder.Append(ch)
            End If
        Next
        Return builder.ToString().Normalize(NormalizationForm.FormC)
    End Function

    Private Sub AddWords(target As Dictionary(Of String, Integer), source As Dictionary(Of String, Integer))
        For Each kvp In source
            target(kvp.Key) = kvp.Value
        Next
    End Sub

    Public Function BuildAgeWordAlternation(lexicon As Dictionary(Of String, Integer)) As String
        Return String.Join("|", lexicon.Keys.
            OrderByDescending(Function(w) w.Length).
            Select(Function(w) "\b" & Regex.Escape(w) & "\b"))
    End Function

End Module
