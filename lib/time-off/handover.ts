import type { TransitionTask } from '@/lib/leave-transition-plan'

/** One of the viewer's open tasks from My work, offered as a handover item. */
export interface HandoverSuggestion {
  id: string
  title: string
  projectName: string
}

export const MAX_HANDOVER_SUGGESTIONS = 5

export const EMPTY_HANDOVER_TASK: TransitionTask = {
  taskDetails: '',
  projectDept: '',
  assignedTo: '',
  accepted: null,
  deadline: null,
  completed: null,
  variance: '',
  links: '',
}

export function taskFromSuggestion(suggestion: HandoverSuggestion): TransitionTask {
  return { ...EMPTY_HANDOVER_TASK, taskDetails: suggestion.title, projectDept: suggestion.projectName }
}

const matches = (task: TransitionTask, s: HandoverSuggestion): boolean =>
  task.taskDetails.trim() === s.title.trim() && task.projectDept.trim() === s.projectName.trim()

export function isSuggestionAdded(tasks: readonly TransitionTask[], suggestion: HandoverSuggestion): boolean {
  return tasks.some((task) => matches(task, suggestion))
}

/** Ticking a suggestion adds it as an item; unticking takes that item out again. */
export function toggleSuggestion(tasks: readonly TransitionTask[], suggestion: HandoverSuggestion): TransitionTask[] {
  if (isSuggestionAdded(tasks, suggestion)) return tasks.filter((task) => !matches(task, suggestion))
  return [...tasks, taskFromSuggestion(suggestion)]
}
