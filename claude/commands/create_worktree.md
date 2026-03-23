# create_worktree

2. set up worktree for implementation:
   2a. read `hack/create_worktree.sh` and create a new worktree with the a git flow branch name based on what the user will likely do next: `./hack/create_worktree.sh SHORT_CLEVER_NAME BRANCH_NAME`

3a. confirm with the user by sending a message to the Human

```
based on the input, I plan to create a worktree with the following details:

worktree path: ~/FULL_PATH
branch name: BRANCH_NAME
```

incorporate any user feedback then:

4. run the create_worktree.sh and create the work tree
