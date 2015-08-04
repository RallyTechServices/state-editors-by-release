#State Editor by Release

For the selected release, displays a grid of all stories associated with the release, the accepted date,
and the last person to accept the story.

![ScreenShot](/images/state-editoris-by-release.png)

If the story bypasses the Accepted state in a transition (e.g. Completed >> Released), then the Accepted By
person will be the user who made the transition.

If the story transitions into the Accepted state and then into a state beyond the accepted state, then the
Accepted By person will be the user who made the transition into the Accepted state on the date that it was
last accepted.

If the story transitions into a state beyond the accepted state and then back into the accepted state,
then the Accepted By user will be the one who made the backwards transition into the Accepted state on the date
it was transitioned back into the Accepted state.

If a story is transitioned into the Accepted state multiple times, the report will show the last date and user
that the story was transitioned into the Accepted state (or transitions from a state before the Accepted
state to a state beyond the Accepted state).

If a story is currently in a state before the Accepted state, then no Accepted By or Accepted Date will be
displayed, even if the story was previously transitioned into the Accepted state and then transitioned back
into a state prior to the Accepted state.

If the Accepted By user cannot be found in the Subscription or Workspace, then the Objectid for the
missing user will be displayed with a message indicating that the user cannot be found. 

This app will display all stories associated with the selected release in any projects in the workspace
that the user has viewer or higher access to.

Note that if a story transitioned past the accepted state before it was associated with the selected release, the
accepted date and person may not be displayed in this report.

The app uses Rally App SDK v2.0 and the Lookback API (LBAPI).