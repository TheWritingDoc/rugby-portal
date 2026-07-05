// Sport catalog. The portal started as schools rugby (EPHSRU) and has been
// expanded to club rugby (EPRU) and other Eastern Cape team sports at both
// school and club level. Positions and divisions are per sport / per level;
// the original rugby exports stay for backward compatibility.
export const SPORTS = ['Rugby', 'Soccer', 'Netball', 'Cricket'] as const

export const POSITIONS_BY_SPORT: Record<string, string[]> = {
  Rugby: ['Prop', 'Hooker', 'Lock', 'Flanker', 'Number 8', 'Scrum-half', 'Fly-half', 'Centre', 'Wing', 'Fullback'],
  Soccer: ['Goalkeeper', 'Right Back', 'Left Back', 'Centre Back', 'Defensive Midfielder', 'Central Midfielder', 'Attacking Midfielder', 'Right Winger', 'Left Winger', 'Striker'],
  Netball: ['Goal Shooter', 'Goal Attack', 'Wing Attack', 'Centre', 'Wing Defence', 'Goal Defence', 'Goal Keeper'],
  Cricket: ['Opening Batter', 'Batter', 'Wicketkeeper', 'All-rounder', 'Fast Bowler', 'Spin Bowler'],
}

// School competitions run in age groups; club competitions run in divisions.
export const SCHOOL_AGE_GROUPS = ['U15', 'U16', 'U17', 'U19']
export const CLUB_AGE_GROUPS = ['U19', 'U21', 'Senior', 'Veterans']

// Backward-compatible rugby-school exports (used by the original forms).
export const AGE_GROUPS = SCHOOL_AGE_GROUPS
export const POSITIONS = POSITIONS_BY_SPORT.Rugby
export const RELATIONSHIPS = ['Parent', 'Guardian', 'Relative', 'Other']
