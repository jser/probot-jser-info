/**
 *
 * @param {*} robot
 * @param {string} owner
 * @param {string} repo
 * @param {string} branch
 * @param {(item:*): item) renameItem
 * @returns {Promise<void>}
 *
 * https://medium.com/@obodley/renaming-a-file-using-the-git-api-fed1e6f04188
 * http://www.levibotelho.com/development/commit-a-file-with-the-github-api/

 */
const rename = async (robot, { ref, owner, repo, branch }, renameItem) => {
    robot.log("start rename", {
        ref,
        owner,
        repo,
        branch
    });
    const octokit = robot.github;
    // https://developer.github.com/v3/repos/branches/#get-branch
    const { data: branchResponse } = await octokit.repos.getBranch({ owner, repo, branch });
    // https://developer.github.com/v3/git/trees/#get-a-tree
    robot.log("branchResponse", branchResponse);
    const parentSha = branchResponse.commit.commit.tree.sha;
    const { data: treeResponse } = await octokit.gitdata.getTree({
        owner,
        repo,
        // TODO: API document is wrong
        sha: parentSha,
        tree_sha: parentSha,
        recursive: 1
    });
    robot.log("treeResponse", treeResponse);
    // modify file path
    const renamedTree = treeResponse.tree.map(item => {
        const renamedItem = renameItem(item);
        if (renamedItem.path !== item.path) {
            return renamedItem;
        }
        return item;
    });
    // if (renamedTree.length === 0) {
    //     robot.log("No modified file", renamedTree);
    //     return;
    // }
    robot.log("renamedTree", renamedTree);
    // Post: https://developer.github.com/v3/git/trees/#create-a-tree
    const { data: createTreeResponse } = await octokit.gitdata.createTree({
        owner,
        repo,
        // Should be specified base_tree for rename
        // If it is not specified, create new file
        // base_tree: treeResponse.sha,
        tree: renamedTree
    });
    robot.log("createTreeResponse", createTreeResponse);
    // Commit
    // https://developer.github.com/v3/git/commits/#create-a-commit
    const { data: createCommitResponse } = await octokit.gitdata.createCommit({
        owner,
        repo,
        message: "Rename",
        tree: createTreeResponse.sha,
        // parent sha is this branch sha
        parents: [branchResponse.commit.sha]
        // committer,
        // author
    });
    robot.log("createCommitResponse", createCommitResponse);
    // Post: https://developer.github.com/v3/git/refs/#update-a-reference
    const { data: updateReferenceResponse } = await octokit.gitdata.updateReference({
        owner,
        repo,
        // refs/head/master refer to `sha`
        ref: ref.replace("refs/", ""),
        sha: createCommitResponse.sha
    });
    robot.log("updateReferenceResponse", updateReferenceResponse);
    return {
        status: "ok"
    };
};
