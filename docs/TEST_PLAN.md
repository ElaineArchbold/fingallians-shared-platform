# Test plan

## Do not deploy until all pass

### Activity data
- Confirm each squad has the same videos as the current live app.
- Confirm each squad has the same activities as the current live app.
- Confirm Friday Night Hurling appears only for 2014 Boys and 2015 Girls.
- Confirm Friday Night Hurling does not appear for 2017 Boys and 2017 Girls.

### Wording
- Confirm all parent-facing screens say child, not son/daughter.

### Auth
- Login parent.
- Login admin.
- Login super admin.
- Logout.

### Parent
- Select squad/year.
- Select your child.
- Confirm parent sees only selected child's squad.
- Confirm existing URLs preselect correct squad.

### Admin
- Admin sees only assigned squad.
- SuperAdmin can switch squads.

### Runs
- GPS run cannot be removed from saved run modal.
- Manual entry can be removed.
- Saved run card header is centered.
- Share/save screenshot works.
