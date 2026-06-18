''' <summary>
''' Resolves design-time disambiguation copy from ontology.disambiguationPlan (mirrors TS compileDisambiguationPlan signatures).
''' </summary>
Public Module DisambiguationCopy

    Private Const MissingValue As String = "none"
    Private Const MultiChoiceMarker As String = "__multi__"
    Private Const MultiChoiceThreshold As Integer = 4

    Public Function BuildSignature(categoryName As String, options As IList(Of String)) As String
        Dim category = If(categoryName, String.Empty).Trim()
        Dim style = InferQuestionStyle(options)
        If String.Equals(style, "optional_include", StringComparison.OrdinalIgnoreCase) Then
            Dim value = FirstNonNoneOption(options)
            Return $"{category}||{value}||{style}"
        End If

        Dim visibleCount = CountNonNoneOptions(options)
        If visibleCount > MultiChoiceThreshold Then
            Return $"{category}||{MultiChoiceMarker}||{style}"
        End If

        Dim sorted = SortedOptions(options)
        Return $"{category}||{String.Join("|", sorted)}||{style}"
    End Function

    Public Class DisambiguationHintResolution
        Public Property Text As String
        Public Property Source As String
        Public Property Signature As String
    End Class

    Public Function BuildVincoloAskSignature(categoryName As String) As String
        Return $"vincolo||{If(categoryName, String.Empty).Trim()}||ask"
    End Function

    Public Function ResolveVincoloAskHint(
        bundle As Models.AgentBundle,
        conversation As Models.AgentSessionState,
        categoryName As String
    ) As DisambiguationHintResolution
        Dim signature = BuildVincoloAskSignature(categoryName)
        Dim record = FindVincoloAskRecord(bundle, categoryName)

        If conversation IsNot Nothing AndAlso conversation.NoMatchCount > 0 Then
            Dim noMatchText = ResolveVincoloNoMatch(bundle, categoryName, conversation.NoMatchCount - 1)
            If Not String.IsNullOrWhiteSpace(noMatchText) Then
                Return New DisambiguationHintResolution With {
                    .Text = noMatchText.Trim(),
                    .Source = If(record IsNot Nothing AndAlso Not String.IsNullOrWhiteSpace(record.Question),
                                  "disambiguation_plan_no_match", "template"),
                    .Signature = signature
                }
            End If
        End If

        If record IsNot Nothing AndAlso Not String.IsNullOrWhiteSpace(record.Question) Then
            Return New DisambiguationHintResolution With {
                .Text = record.Question.Trim(),
                .Source = "disambiguation_plan",
                .Signature = signature
            }
        End If

        Return New DisambiguationHintResolution With {
            .Text = ConstraintValidation.AgeYearsQuestion,
            .Source = "template",
            .Signature = signature
        }
    End Function

    Public Function ResolveDisambiguationHint(
        bundle As Models.AgentBundle,
        conversation As Models.AgentSessionState,
        categoryName As String,
        options As IList(Of String)
    ) As DisambiguationHintResolution
        Dim signature = BuildSignature(categoryName, options)
        Dim record = FindMessage(bundle, categoryName, options)
        Dim hasPlan = record IsNot Nothing AndAlso Not String.IsNullOrWhiteSpace(record.Question)

        If conversation IsNot Nothing AndAlso conversation.NoMatchCount > 0 Then
            Dim noMatchText = ResolveNoMatch(bundle, categoryName, options, conversation.NoMatchCount - 1)
            If Not String.IsNullOrWhiteSpace(noMatchText) Then
                Return New DisambiguationHintResolution With {
                    .Text = noMatchText.Trim(),
                    .Source = If(hasPlan, "disambiguation_plan_no_match", "template"),
                    .Signature = signature
                }
            End If
        End If

        If hasPlan Then
            Return New DisambiguationHintResolution With {
                .Text = record.Question.Trim(),
                .Source = "disambiguation_plan",
                .Signature = signature
            }
        End If

        Return New DisambiguationHintResolution With {
            .Text = DialogPhrases.BuildAttributeSpokenHint(categoryName, options),
            .Source = "template",
            .Signature = signature
        }
    End Function

    Public Function ResolveQuestion(
        bundle As Models.AgentBundle,
        categoryName As String,
        options As IList(Of String)
    ) As String
        Dim record = FindMessage(bundle, categoryName, options)
        If record IsNot Nothing AndAlso Not String.IsNullOrWhiteSpace(record.Question) Then
            Return record.Question.Trim()
        End If
        Return DialogPhrases.BuildAttributeSpokenHint(categoryName, options)
    End Function

    Public Function ResolveNoMatch(
        bundle As Models.AgentBundle,
        categoryName As String,
        options As IList(Of String),
        noMatchCount As Integer
    ) As String
        Dim record = FindMessage(bundle, categoryName, options)
        If record Is Nothing Then Return String.Empty

        Dim reply As String = Nothing
        Select Case Math.Max(0, Math.Min(noMatchCount, 2))
            Case 0
                reply = record.NoMatch1
            Case 1
                reply = record.NoMatch2
            Case Else
                reply = record.NoMatch3
        End Select

        If Not String.IsNullOrWhiteSpace(reply) Then Return reply.Trim()

        Dim question = If(Not String.IsNullOrWhiteSpace(record.Question), record.Question.Trim(), String.Empty)
        If String.IsNullOrWhiteSpace(question) Then Return String.Empty
        Dim defaults = DialogPhrases.DefaultNoMatchReplies(question)
        Select Case Math.Max(0, Math.Min(noMatchCount, 2))
            Case 0 : Return defaults.NoMatch1
            Case 1 : Return defaults.NoMatch2
            Case Else : Return defaults.NoMatch3
        End Select
    End Function

    Private Function FindVincoloAskRecord(
        bundle As Models.AgentBundle,
        categoryName As String
    ) As Models.DisambiguationMessage
        Dim plan = bundle?.Ontology?.DisambiguationPlan
        If plan?.Messages Is Nothing OrElse plan.Messages.Count = 0 Then Return Nothing

        Dim signature = BuildVincoloAskSignature(categoryName)
        Dim record = plan.Messages.FirstOrDefault(
            Function(m) m IsNot Nothing AndAlso String.Equals(m.Signature?.Trim(), signature, StringComparison.Ordinal))
        If record IsNot Nothing Then Return record

        Return plan.Messages.FirstOrDefault(
            Function(m) m IsNot Nothing AndAlso String.Equals(m.Signature?.Trim(), "ask_age", StringComparison.Ordinal))
    End Function

    Private Function ResolveVincoloNoMatch(
        bundle As Models.AgentBundle,
        categoryName As String,
        noMatchCount As Integer
    ) As String
        Dim record = FindVincoloAskRecord(bundle, categoryName)
        If record Is Nothing Then Return String.Empty

        Dim reply As String = Nothing
        Select Case Math.Max(0, Math.Min(noMatchCount, 2))
            Case 0
                reply = record.NoMatch1
            Case 1
                reply = record.NoMatch2
            Case Else
                reply = record.NoMatch3
        End Select

        If Not String.IsNullOrWhiteSpace(reply) Then Return reply.Trim()

        Dim question = If(Not String.IsNullOrWhiteSpace(record.Question), record.Question.Trim(), String.Empty)
        If String.IsNullOrWhiteSpace(question) Then Return String.Empty
        Dim defaults = DialogPhrases.DefaultNoMatchReplies(question)
        Select Case Math.Max(0, Math.Min(noMatchCount, 2))
            Case 0 : Return defaults.NoMatch1
            Case 1 : Return defaults.NoMatch2
            Case Else : Return defaults.NoMatch3
        End Select
    End Function

    Private Function FindMessage(
        bundle As Models.AgentBundle,
        categoryName As String,
        options As IList(Of String)
    ) As Models.DisambiguationMessage
        Return FindMessageRecord(bundle, categoryName, options)
    End Function

    Public Function FindMessageRecord(
        bundle As Models.AgentBundle,
        categoryName As String,
        options As IList(Of String)
    ) As Models.DisambiguationMessage
        Dim plan = bundle?.Ontology?.DisambiguationPlan
        If plan?.Messages Is Nothing OrElse plan.Messages.Count = 0 Then Return Nothing

        Dim signature = BuildSignature(categoryName, options)
        Return plan.Messages.FirstOrDefault(
            Function(m) m IsNot Nothing AndAlso String.Equals(m.Signature?.Trim(), signature, StringComparison.Ordinal))
    End Function

    Private Function InferQuestionStyle(options As IList(Of String)) As String
        Dim visible = NonNoneOptions(options)
        If HasMissingValue(options) AndAlso visible.Count = 1 Then Return "optional_include"
        Return "choice"
    End Function

    Private Function HasMissingValue(options As IList(Of String)) As Boolean
        If options Is Nothing Then Return False
        Return options.Any(Function(o) String.Equals(o?.Trim(), MissingValue, StringComparison.OrdinalIgnoreCase))
    End Function

    Private Function NonNoneOptions(options As IList(Of String)) As List(Of String)
        If options Is Nothing Then Return New List(Of String)()
        Return options.
            Where(Function(o) Not String.IsNullOrWhiteSpace(o) AndAlso
                              Not String.Equals(o.Trim(), MissingValue, StringComparison.OrdinalIgnoreCase)).
            Select(Function(o) o.Trim()).
            ToList()
    End Function

    Private Function CountNonNoneOptions(options As IList(Of String)) As Integer
        Return NonNoneOptions(options).Count
    End Function

    Private Function FirstNonNoneOption(options As IList(Of String)) As String
        Dim visible = NonNoneOptions(options)
        If visible.Count = 0 Then Return String.Empty
        Return visible(0)
    End Function

    Private Function SortedOptions(options As IList(Of String)) As List(Of String)
        If options Is Nothing Then Return New List(Of String)()
        Return options.
            Where(Function(o) Not String.IsNullOrWhiteSpace(o)).
            Select(Function(o) o.Trim()).
            OrderBy(Function(o) o, StringComparer.Create(Globalization.CultureInfo.GetCultureInfo("it-IT"), False)).
            ToList()
    End Function

End Module
