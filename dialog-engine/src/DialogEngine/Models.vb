''' <summary>
''' VB-native data contracts: Ontology + Catalog (compile-time) and Concept-based runtime.
''' </summary>
Namespace Models

    ''' <summary>Category semantic type: attributo (catalog dimension) or vincolo (eligibility rule).</summary>
    Public Enum ConceptKind
        Attributo
        Vincolo
    End Enum

    ' --- Ontology (category definitions + dialog tree) ---

    Public Class CategoryGrammar
        Public Property Regex As String
        Public Property Mappings As Dictionary(Of String, String)
    End Class

    Public Class CategoryDefinition
        Public Property Id As String
        Public Property Name As String
        Public Property Order As Integer
        Public Property Kind As ConceptKind = ConceptKind.Attributo
        Public Property ValueKind As String
        Public Property AllowedValues As List(Of String) = New List(Of String)()
        Public Property Grammar As CategoryGrammar
        Public Property Resolution As ResolutionPipeline
    End Class

    ''' <summary>Design-time vincolo resolution contract (pipeline v1).</summary>
    Public Class ResolutionPipeline
        Public Property Engine As String
        Public Property Version As Integer
        Public Property ValueKind As String
        Public Property Steps As List(Of ResolutionStep) = New List(Of ResolutionStep)()
    End Class

    Public Class ResolutionStep
        Public Property Type As String
        Public Property Pattern As String
        Public Property ValueGroup As Integer?
        Public Property WordGroup As Integer?
        Public Property UnitGroup As Integer?
        Public Property DefaultUnit As String
        Public Property UnitMap As Dictionary(Of String, String)
        Public Property WordValueMap As Dictionary(Of String, Integer)
        Public Property Entries As List(Of WordMapEntry) = New List(Of WordMapEntry)()
    End Class

    Public Class WordMapEntry
        Public Property Word As String
        Public Property Value As Integer
        Public Property Unit As String
    End Class

    ''' <summary>Extracted vincolo value with unit (years, months, weeks, days).</summary>
    Public Class ResolvedQuantity
        Public Property Value As Integer
        Public Property Unit As String
    End Class

    Public Class DialogNode
        Public Property Path As String
        Public Property ConfirmationText As String
    End Class

    ''' <summary>Editable copy for one disambiguation signature (shared across contexts).</summary>
    Public Class DisambiguationMessage
        Public Property Signature As String
        Public Property CategoryName As String
        Public Property Question As String
        Public Property NoMatch1 As String
        Public Property NoMatch2 As String
        Public Property NoMatch3 As String
        Public Property Style As String
        Public Property AnswerGrammar As CategoryGrammar
    End Class

    Public Class DisambiguationPlan
        Public Property ComputedAt As String
        Public Property Messages As List(Of DisambiguationMessage) = New List(Of DisambiguationMessage)()
    End Class

    Public Class Ontology
        Public Property Id As String
        Public Property DocumentId As String
        Public Property StartQuestion As String
        Public Property ConfirmationPreamble As String
        Public Property Categories As List(Of CategoryDefinition) = New List(Of CategoryDefinition)()
        Public Property Nodes As List(Of DialogNode) = New List(Of DialogNode)()
        Public Property DisambiguationPlan As DisambiguationPlan
    End Class

    ' --- Catalog (prestazioni materializzate) ---

    Public Class AgeConstraint
        Public Property CategoryName As String
        Public Property Min As Integer?
        Public Property Max As Integer?
        ''' <summary>Inclusive lower bound in total months (preferred when set).</summary>
        Public Property MinMonths As Integer?
        ''' <summary>Inclusive upper bound in total months (legacy).</summary>
        Public Property MaxMonths As Integer?
        ''' <summary>Inclusive lower bound in total weeks (canonical runtime unit).</summary>
        Public Property MinWeeks As Integer?
        ''' <summary>Inclusive upper bound in total weeks (canonical runtime unit).</summary>
        Public Property MaxWeeks As Integer?
    End Class

    ''' <summary>Category + canonical values; Kind (attributo/vincolo) set on catalog items only.</summary>
    Public Class Concept
        Public Property Category As String
        Public Property Values As List(Of String) = New List(Of String)()
        Public Property Kind As ConceptKind = ConceptKind.Attributo
        ''' <summary>Vincolo resolution unit: years, months, weeks, days.</summary>
        Public Property Unit As String
    End Class

    Public Class CatalogItem
        Public Property Path As String
        Public Property Concepts As List(Of Concept) = New List(Of Concept)()
        Public Property AgeConstraints As List(Of AgeConstraint) = New List(Of AgeConstraint)()
    End Class

    Public Class Catalog
        Public Property Items As List(Of CatalogItem) = New List(Of CatalogItem)()
    End Class

    ' --- Bundle ---

    Public Class AgentBundleMeta
        Public Property DocumentName As String
        Public Property DocumentId As String
        Public Property Mode As String
        Public Property Version As String
        Public Property CompiledAt As String
        Public Property Warnings As List(Of String) = New List(Of String)()
    End Class

    Public Class AgentBundle
        Public Property Meta As AgentBundleMeta
        Public Property Ontology As Ontology
        Public Property Catalog As Catalog
    End Class

    ' --- Runtime turn processing ---

    Public Class ExpectedConstraint
        Public Property CategoryName As String
        Public Property ValueKind As String
        Public Property Description As String
        Public Property AllowedTokens As List(Of String) = New List(Of String)()
    End Class

    Public Class AgentTurnInstruction
        Public Property Action As String
        Public Property CategoryName As String
        Public Property Options As List(Of String)
        Public Property ImplicitValue As String
        Public Property Path As String
        Public Property ExpectedConstraints As List(Of ExpectedConstraint) = New List(Of ExpectedConstraint)()
    End Class

    Public Class AgentSessionState
        ''' <summary>Concepts acquired during the conversation (attributo + vincolo).</summary>
        Public Property AcquiredConcepts As List(Of Concept) = New List(Of Concept)()
        ''' <summary>Attributo categories committed via an explicit disambiguation option pick.</summary>
        Public Property ExactAttributoCategories As List(Of String) = New List(Of String)()
        Public Property SelectedPath As String
        Public Property NoMatchCount As Integer
        Public Property LastTranscript As String
        Public Property PendingConstraint As ExpectedConstraint
    End Class

    ''' <summary>Explicit reply anchor: user utterance answers this disambiguation prompt (survives lost session pending).</summary>
    Public Class DisambiguationAnswerContext
        Public Property CategoryName As String
        Public Property Options As List(Of String) = New List(Of String)()
        Public Property Signature As String
        Public Property ValueKind As String
    End Class

    Public Class AgentTurnInput
        ''' <summary>Pre-parsed slots from an external agent (e.g. ElevenLabs webhook); not VB-extracted.</summary>
        Public Property IncomingConcepts As List(Of Concept) = New List(Of Concept)()
        Public Property Transcript As String
        Public Property ConfirmImplicitConcepts As Boolean
        ''' <summary>When set, restores pending disambiguation if session cache was lost between question and reply.</summary>
        Public Property DisambiguationAnswerContext As DisambiguationAnswerContext
    End Class

    Public Class AgentTurnResult
        Public Property Instruction As AgentTurnInstruction
        Public Property Parsed As List(Of Concept) = New List(Of Concept)()
        Public Property SpokenHint As String
        ''' <summary>disambiguation_plan | disambiguation_plan_no_match | template (test UI only).</summary>
        Public Property SpokenHintSource As String
        Public Property DisambiguationSignature As String
        Public Property CandidateCount As Integer
        Public Property SurvivingPaths As List(Of String)
        Public Property NextState As AgentSessionState
    End Class

    Public Class AgentDialogStepHttpResponse
        Public Property Ok As Boolean = True
        Public Property ConversationId As String
        Public Property DocumentId As String
        Public Property Instruction As AgentTurnInstruction
        Public Property SpokenHint As String
        Public Property CandidateCount As Integer
        Public Property Debug As AgentDialogStepDebugPayload
    End Class

    Public Class AgentDialogStepDebugPayload
        Public Property Log As String
        Public Property Parsed As List(Of Concept)
        Public Property ParsedBlock As String
        Public Property SurvivingPaths As List(Of String)
        Public Property NextState As AgentSessionState
    End Class

End Namespace
