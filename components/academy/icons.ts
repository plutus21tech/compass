import {
  BookOpen, Bus, CalendarDays, Clock, Gift, GraduationCap, Heart, HeartPulse, Home, Laptop, Linkedin,
  MessageCircle, Plane, PlayCircle, Receipt, Rocket, ShieldCheck, Smartphone, Sparkles, Target, TrendingUp,
  Users, Utensils, Wallet, Wrench,
  type LucideIcon,
} from 'lucide-react'

// Named one by one so the page does not ship the whole icon set. Icon names are stored as text.
const ICONS: Record<string, LucideIcon> = {
  BookOpen, Bus, CalendarDays, Clock, Gift, GraduationCap, Heart, HeartPulse, Home, Laptop, Linkedin,
  MessageCircle, Plane, PlayCircle, Receipt, Rocket, ShieldCheck, Smartphone, Target, TrendingUp, Users,
  Utensils, Wallet, Wrench,
}

export function academyIcon(name: string | null): LucideIcon {
  return (name && Object.prototype.hasOwnProperty.call(ICONS, name) ? ICONS[name] : null) ?? Sparkles
}
