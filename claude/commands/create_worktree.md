# create_worktree

2. set up worktree for implementation:
   2a. read `hack/create_worktree.sh` and create a new worktree with the a git flow branch name based on what the user will likely do next: `./hack/create_worktree.sh SHORT_CLEVER_NAME BRANCH_NAME`

3a. Use the `clarify` tool to confirm with the user. Present the proposed worktree details and ask for confirmation:
   - Option 1: "Yes, create it"
   - Option 2: "Change the name"
   - Option 3: "Change the branch name"
   - Option 4: "Cancel"

   Include the proposed worktree path and branch name in the question prompt text.

incorporate any user feedback then:

4. run the create_worktree.sh and create the work tree
