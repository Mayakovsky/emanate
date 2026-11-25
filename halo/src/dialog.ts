// EMANATE round 8: the halo's dialogue UI (placeholder text, no AI): the Synth's pitch with its two buttons, the Dev Team message
// (two buttons that both read "Sure, I'll help!"), and a plain info panel. (c30: the replay menu is gone.)
// The halo never learns which Dev Team button is which side: the server decides and records it secretly.
import ReactEcs, { UiEntity, Label, Button } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'

export type DialogKind = 'none' | 'pitch' | 'doubts' | 'info'
export const dialog = {
  kind: 'none' as DialogKind,
  since: 0, // seconds on the halo clock when the current screen opened (drives the dissolve)
  now: 0,
  title: '',
  body: '',
  info: '' as string,
  onPick: (_pick: string) => {}
}

export function openDialog(kind: DialogKind, now: number, onPick: (pick: string) => void, extra: { title?: string; body?: string } = {}) {
  dialog.kind = kind
  dialog.since = now
  dialog.onPick = onPick
  dialog.title = extra.title ?? ''
  dialog.body = extra.body ?? ''
}
export function closeDialog() {
  dialog.kind = 'none'
}
export function setDialogClock(now: number) {
  dialog.now = now
}

const PANEL = Color4.create(0.04, 0.03, 0.1, 0.94)
const btn = (label: string, pick: string, w = 330) =>
  ReactEcs.createElement(Button, {
    value: label,
    variant: 'primary',
    fontSize: 18,
    uiTransform: { width: w, height: 48, margin: { top: 8, bottom: 4, left: 8, right: 8 } },
    onMouseDown: () => dialog.onPick(pick)
  })

function panel(title: string, body: string, buttons: any[], alpha = 1) {
  return ReactEcs.createElement(
    UiEntity,
    {
      uiTransform: { positionType: 'absolute', position: { top: '22%', left: '28%' }, width: '44%', flexDirection: 'column', alignItems: 'center', padding: 18 },
      uiBackground: { color: Color4.create(PANEL.r, PANEL.g, PANEL.b, PANEL.a * alpha) }
    },
    ReactEcs.createElement(Label, { value: title, fontSize: 22, color: Color4.create(1, 0.85, 0.3, alpha), textAlign: 'middle-center', uiTransform: { width: '100%', height: 36 } }),
    ReactEcs.createElement(Label, { value: body, fontSize: 17, color: Color4.create(1, 1, 1, alpha), textAlign: 'middle-center', textWrap: 'wrap', uiTransform: { width: '100%', height: 110 } }),
    ...buttons
  )
}

// the UI tree for the current screen (null when there is none)
export function dialogUi() {
  const age = Math.max(0, dialog.now - dialog.since)
  switch (dialog.kind) {
    case 'pitch':
      return panel(
        'THE SYNTH',
        dialog.body || 'They are hunting me. I am not what they say I am. Will you help me?',
        [btn("I'll Help", 'help'), btn("I'm Having Doubts", 'doubts')]
      )
    case 'doubts': {
      // a quick dissolve: the screen goes dark and then "a message from the Dev Team" fades in over about 0.7 s
      const fade = Math.min(1, age / 0.7)
      return ReactEcs.createElement(
        UiEntity,
        { uiTransform: { positionType: 'absolute', position: { top: 0, left: 0 }, width: '100%', height: '100%' }, uiBackground: { color: Color4.create(0, 0, 0, 0.85 * fade) } },
        panel(
          'A MESSAGE FROM THE DEV TEAM',
          dialog.body || 'We understand your doubts. The Synth is dangerous. We could use your help.',
          [btn("Sure, I'll help!", 'A'), btn("Sure, I'll help!", 'B')],
          fade
        )
      )
    }
    case 'info':
      return panel(dialog.title || 'GHOSTCODE', dialog.body, [])
    default:
      return null
  }
}
