''' <summary>
''' Converts age quantities with unit to catalog age_years for min/max filtering.
''' </summary>
Public Module AgeUnitConverter

    Public Function ToYears(quantity As Models.ResolvedQuantity) As Integer?
        If quantity Is Nothing Then Return Nothing
        Return ToYears(quantity.Value, quantity.Unit)
    End Function

    Public Function ToYears(value As Integer, unit As String) As Integer?
        If value < 0 Then Return Nothing
        Dim totalMonths = ToTotalMonths(value, unit)
        If Not totalMonths.HasValue Then Return Nothing
        Return totalMonths.Value \ 12
    End Function

    ''' <summary>Patient age as total months for inclusive min/max year constraints.</summary>
    Public Function ToTotalMonths(value As Integer, unit As String) As Integer?
        If value < 0 Then Return Nothing
        Dim u = ParseUnitToken(unit)
        Select Case u
            Case "years"
                Return value * 12
            Case "months"
                Return value
            Case "weeks"
                Return (value * 12 + 26) \ 52
            Case "days"
                Return (value * 12 + 182) \ 365
            Case Else
                Return Nothing
        End Select
    End Function

    Public Function ParseUnitToken(token As String) As String
        Dim t = If(token, String.Empty).Trim().ToLowerInvariant()
        If String.IsNullOrWhiteSpace(t) Then Return "years"
        Select Case t
            Case "anno", "anni", "years", "year" : Return "years"
            Case "mese", "mesi", "months", "month" : Return "months"
            Case "settimana", "settimane", "weeks", "week" : Return "weeks"
            Case "giorno", "giorni", "days", "day" : Return "days"
            Case Else : Return t
        End Select
    End Function

End Module
