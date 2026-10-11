import { Text, View } from 'react-native'
import { Check, CircleDashed, Clock, X } from 'lucide-react-native'
import { Pill } from '../../components/Button'
import Card from '../../components/Card'
import Screen, { Empty, SectionLabel, useLoad } from '../../components/Screen'
import { api } from '../../lib/apiClient'
import { colors, radius, space, type } from '../../theme/tokens'

const fetchAssessments = () => api.driver.assessments()

const GROUPS = [
  ['WRITTEN', 'Written tests'],
  ['PRACTICAL', 'Practical tests'],
  ['LIVENESS', 'Liveness checks'],
  ['REACTION', 'Reaction checks'],
  ['DOCUMENT_REVIEW', 'Document reviews'],
]

const STATE = {
  NOT_STARTED: { label: 'Not taken', tone: 'neutral', icon: CircleDashed, color: colors.textMuted },
  IN_PROGRESS: { label: 'In progress', tone: 'neutral', icon: Clock, color: colors.textMuted },
  AWAITING_RESULT: { label: 'Awaiting result', tone: 'neutral', icon: Clock, color: colors.textMuted },
  PASSED: { label: 'Passed', tone: 'safe', icon: Check, color: colors.graphite },
  FAILED: { label: 'Not passed', tone: 'brand', icon: X, color: colors.red },
}

const when = (iso) =>
  new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })

function detail(a) {
  if (a.state === 'PASSED') return a.last_score != null ? `Score ${a.last_score} · pass mark ${a.passing_score}` : 'Passed'
  if (a.state === 'AWAITING_RESULT') return `Submitted ${when(a.last_submitted_at)}. An examiner is grading it.`
  if (a.state === 'IN_PROGRESS') return 'Started but not submitted yet.'
  if (a.state === 'FAILED') {
    const score = a.last_score != null ? `Score ${a.last_score}, pass mark ${a.passing_score}. ` : ''
    if (a.attempts_left === 0) return `${score}No attempts left. Contact MyDriver support.`
    const retry = a.retry_at && new Date(a.retry_at).getTime() > Date.now() ? `You can retake it after ${when(a.retry_at)}.` : 'You can retake it now.'
    return `${score}${retry}`
  }
  return a.kind === 'PRACTICAL'
    ? `Pass mark ${a.passing_score}. MyDriver will contact you with a date.`
    : `Pass mark ${a.passing_score} · ${a.attempts_left} attempt${a.attempts_left === 1 ? '' : 's'} allowed`
}

function Row({ a }) {
  const s = STATE[a.state] ?? STATE.NOT_STARTED
  const Icon = s.icon
  return (
    <View style={{ flexDirection: 'row', gap: space.md }}>
      <View
        style={{
          width: 32,
          height: 32,
          borderRadius: radius.sm,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: a.state === 'FAILED' ? colors.redSoft : colors.surfaceAlt,
        }}
      >
        <Icon size={16} color={s.color} />
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          <Text style={{ ...type.body, color: colors.text, flex: 1 }}>{a.title}</Text>
          <Pill label={s.label} tone={s.tone} />
        </View>
        <Text style={{ ...type.tiny, color: colors.textMuted, lineHeight: 16 }}>{detail(a)}</Text>
        {a.examiner_notes ? (
          <Text style={{ ...type.tiny, color: colors.text, lineHeight: 16 }}>Examiner: {a.examiner_notes}</Text>
        ) : null}
      </View>
    </View>
  )
}

export default function AssessmentsScreen() {
  const load = useLoad(fetchAssessments)
  return (
    <Screen title="Tests" subtitle="Tests you need to pass to earn badges" load={load}>
      {(list) => (
        <>
          {list.length === 0 && <Empty>No tests are open right now.</Empty>}
          {GROUPS.map(([kind, label]) => {
            const items = list.filter((a) => a.kind === kind)
            if (items.length === 0) return null
            return (
              <View key={kind} style={{ gap: space.lg }}>
                <SectionLabel>{label}</SectionLabel>
                <Card style={{ gap: space.lg }}>
                  {items.map((a) => (
                    <Row key={a.code} a={a} />
                  ))}
                </Card>
              </View>
            )
          })}
        </>
      )}
    </Screen>
  )
}
