import { describe, it, expect, vi } from 'vitest'
import {
  routeKanbanWorkButtonClick,
  type RouteKanbanWorkButtonDeps,
} from './kanbanWorkButtonRouting'

function makeDeps(
  overrides: Partial<RouteKanbanWorkButtonDeps> = {}
): RouteKanbanWorkButtonDeps {
  return {
    pmChatWidgetOpen: false,
    openPmChatWidget: vi.fn(),
    setSelectedChatTarget: vi.fn(),
    setSelectedConversationId: vi.fn(),
    getDefaultPmConversationId: vi.fn(() => 'project-manager-1'),
    triggerAgentRun: vi.fn(),
    moveTicketToDoingIfNeeded: vi.fn(async () => {}),
    ...overrides,
  }
}

describe('routeKanbanWorkButtonClick (HAL-0700)', () => {
  it('routes Implementation work button to implementation agent without opening PM widget', async () => {
    const deps = makeDeps()

    await routeKanbanWorkButtonClick(
      {
        chatTarget: 'implementation-agent',
        message: 'Implement ticket HAL-0700.',
        ticketPk: 'pk-1',
      },
      deps
    )

    expect(deps.openPmChatWidget).not.toHaveBeenCalled()
    expect(deps.setSelectedChatTarget).not.toHaveBeenCalled()
    expect(deps.setSelectedConversationId).not.toHaveBeenCalled()
    expect(deps.moveTicketToDoingIfNeeded).toHaveBeenCalledWith({
      ticketPk: 'pk-1',
      chatTarget: 'implementation-agent',
    })
    expect(deps.triggerAgentRun).toHaveBeenCalledWith(
      'Implement ticket HAL-0700.',
      'implementation-agent'
    )
  })

  it('routes QA work button to QA agent without opening PM widget', async () => {
    const deps = makeDeps()

    await routeKanbanWorkButtonClick(
      {
        chatTarget: 'qa-agent',
        message: 'QA ticket HAL-0700.',
        ticketPk: 'pk-2',
      },
      deps
    )

    expect(deps.openPmChatWidget).not.toHaveBeenCalled()
    expect(deps.setSelectedChatTarget).not.toHaveBeenCalled()
    expect(deps.setSelectedConversationId).not.toHaveBeenCalled()
    expect(deps.moveTicketToDoingIfNeeded).toHaveBeenCalledWith({
      ticketPk: 'pk-2',
      chatTarget: 'qa-agent',
    })
    expect(deps.triggerAgentRun).toHaveBeenCalledWith(
      'QA ticket HAL-0700.',
      'qa-agent'
    )
  })

  it('routes Prepare work button to PM: opens PM widget (if closed), selects PM, and triggers PM run', async () => {
    const deps = makeDeps({ pmChatWidgetOpen: false })

    await routeKanbanWorkButtonClick(
      {
        chatTarget: 'project-manager',
        message: 'Please prepare ticket HAL-0700.',
      },
      deps
    )

    expect(deps.setSelectedChatTarget).toHaveBeenCalledWith('project-manager')
    expect(deps.setSelectedConversationId).toHaveBeenCalledWith(null)
    expect(deps.getDefaultPmConversationId).toHaveBeenCalled()
    expect(deps.openPmChatWidget).toHaveBeenCalled()
    expect(deps.triggerAgentRun).toHaveBeenCalledWith(
      'Please prepare ticket HAL-0700.',
      'project-manager',
      'project-manager-1'
    )
  })

  it('does not reopen PM widget if it is already open', async () => {
    const deps = makeDeps({ pmChatWidgetOpen: true })

    await routeKanbanWorkButtonClick(
      {
        chatTarget: 'project-manager',
        message: 'Please prepare ticket HAL-0700.',
      },
      deps
    )

    expect(deps.openPmChatWidget).not.toHaveBeenCalled()
  })
})

