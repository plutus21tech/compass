// The culture quiz question bank (spec section 5), word for word. Seeded once per question text;
// HR edits afterwards are never overwritten. valueKey / videoChapterKey are our assignments.
import type { StoredQuestion } from '../lib/academy/quiz'

export type QuizSeedQuestion = Omit<StoredQuestion, 'id'>

export const ACADEMY_QUIZ_QUESTIONS: readonly QuizSeedQuestion[] = [
  {
    questionText: "You notice a faster way to prepare a weekly report your team has done the same way for a year. What fits our culture best?",
    options: [
      "Keep it to yourself, since it is not your process.",
      "Wait until your three-month review to mention it.",
      "Share the idea with your lead and offer to try it.",
      "Change the process yourself without telling anyone.",
    ],
    correctAnswer: "Share the idea with your lead and offer to try it.",
    explanation: "Innovation and Be Proactive. You do not need permission to suggest an improvement, but you change shared processes openly.",
    valueKey: "innovation",
    videoChapterKey: "innovation",
  },
  {
    questionText: "You find a mistake in a deliverable you already sent to a client. What do you do?",
    options: [
      "Fix it quietly in the next version and hope nobody noticed.",
      "Tell your lead straight away, own the mistake and propose a fix.",
      "Wait to see whether the client raises it.",
      "Ask a teammate to send the correction so it does not come from you.",
    ],
    correctAnswer: "Tell your lead straight away, own the mistake and propose a fix.",
    explanation: "Integrity and Accountability. Honesty and ownership protect client trust.",
    valueKey: "integrity",
    videoChapterKey: "integrity",
  },
  {
    questionText: "A teammate is blocked and needs information you have, but you are busy with your own deadline. What is the best response?",
    options: [
      "Reply at the end of the week when you are free.",
      "Tell them to ask someone else.",
      "Send them what they need now, even briefly, or agree a time today.",
      "Ignore the message until they follow up.",
    ],
    correctAnswer: "Send them what they need now, even briefly, or agree a time today.",
    explanation: "Collaboration and Speed. We remove blockers quickly, for ourselves and others.",
    valueKey: "collaboration",
    videoChapterKey: "collaboration",
  },
  {
    questionText: "Which value is described as \"responding quickly, making thoughtful decisions and moving work forward without unnecessary delay\"?",
    options: [
      "Excellence",
      "Accountability",
      "Speed",
      "Innovation",
    ],
    correctAnswer: "Speed",
    explanation: "This is the definition of Speed.",
    valueKey: "speed",
    videoChapterKey: "speed",
  },
  {
    questionText: "Which value do we call \"the foundation of everything we do\"?",
    options: [
      "Collaboration",
      "Integrity",
      "Client-centric",
      "Excellence",
    ],
    correctAnswer: "Integrity",
    explanation: "Integrity underpins trust with clients, partners and each other.",
    valueKey: "integrity",
    videoChapterKey: "integrity",
  },
  {
    questionText: "What does \"no micromanagement\" mean at Plutus21?",
    options: [
      "Nobody checks your work.",
      "You can choose not to attend team calls.",
      "You are trusted to manage your own work and make judgment calls, and you are accountable for the results.",
      "Deadlines are flexible.",
    ],
    correctAnswer: "You are trusted to manage your own work and make judgment calls, and you are accountable for the results.",
    explanation: "Empathy and Trust come together with Accountability.",
    valueKey: "accountability",
    videoChapterKey: "what-we-expect",
  },
  {
    questionText: "You see a colleague repeatedly make demeaning comments to another colleague. What should you do?",
    options: [
      "Nothing, unless the comments are about you.",
      "Joke about it so the tension goes away.",
      "Report it to HR, who will handle it confidentially.",
      "Post about it in a team channel.",
    ],
    correctAnswer: "Report it to HR, who will handle it confidentially.",
    explanation: "We have zero tolerance for harassment and disrespect, and HR handles reports confidentially.",
    valueKey: "integrity",
    videoChapterKey: "a-safe-place",
  },
  {
    questionText: "You begin a relationship with a colleague. What is expected?",
    options: [
      "Nothing, it is private.",
      "Tell your team on Discord.",
      "Disclose it to HR.",
      "Ask one of you to change teams.",
    ],
    correctAnswer: "Disclose it to HR.",
    explanation: "Our code of conduct asks that workplace relationships are disclosed to HR.",
    valueKey: "integrity",
    videoChapterKey: "how-we-treat-each-other",
  },
  {
    questionText: "You will be 15 minutes late to a scheduled team call. What should you do?",
    options: [
      "Join late without saying anything.",
      "Skip the call and catch up later.",
      "Let the organiser and team know before the call starts.",
      "Ask a colleague to cover for you.",
    ],
    correctAnswer: "Let the organiser and team know before the call starts.",
    explanation: "Be Punctual and Reliable. Respecting other people's time is part of how we work.",
    valueKey: "accountability",
    videoChapterKey: "what-we-expect",
  },
  {
    questionText: "Your lead gives you feedback on your work that you do not fully agree with. What is the best response?",
    options: [
      "Accept it silently and move on.",
      "Defend your work until they change their view.",
      "Listen, ask questions to understand it, and discuss it openly and respectfully.",
      "Raise it with another team instead.",
    ],
    correctAnswer: "Listen, ask questions to understand it, and discuss it openly and respectfully.",
    explanation: "Stay Open to Feedback and Practice Open Communication.",
    valueKey: "collaboration",
    videoChapterKey: "how-we-treat-each-other",
  },
  {
    questionText: "Which of the following is NOT on our zero-tolerance list?",
    options: [
      "Harassment",
      "Discrimination",
      "Respectfully disagreeing with your lead in a meeting",
      "Threats or violence",
    ],
    correctAnswer: "Respectfully disagreeing with your lead in a meeting",
    explanation: "Respectful disagreement is healthy and encouraged. Zero tolerance covers discrimination, harassment, misconduct, violence or threats, and substance abuse.",
    valueKey: "integrity",
    videoChapterKey: "a-safe-place",
  },
  {
    questionText: "A client asks for something extra that would help them but is outside the agreed scope. What fits our values best?",
    options: [
      "Say no immediately because it is out of scope.",
      "Promise it without checking whether it can be delivered.",
      "Take it seriously, discuss it with your lead, and be honest with the client about what is possible.",
      "Ignore the request.",
    ],
    correctAnswer: "Take it seriously, discuss it with your lead, and be honest with the client about what is possible.",
    explanation: "Client-centric, with Integrity. We go the extra mile, but we never overpromise.",
    valueKey: "clientCentric",
    videoChapterKey: "client-centric",
  },
]
