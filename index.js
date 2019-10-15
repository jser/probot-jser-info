const path = require("path");
const slug = require("slug");

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
const renameCommit = async (robot, { ref, owner, repo, branch, originalFileName, renameFn }) => {
  robot.log("start rename(delete and create)", {
    ref,
    owner,
    repo,
    branch,
    originalFileName
  });
  const octokit = robot.github;
  // get content
  // http://octokit.github.io/rest.js/#api-Repos-getContent
  const { data: getContentResponse } = await octokit.repos.getContents({
    owner,
    repo,
    path: originalFileName,
    ref
  });
  const decodedContent = new Buffer(getContentResponse.content, "base64").toString();
  const newFileName = renameFn(originalFileName, decodedContent);
  if (originalFileName === newFileName) {
    robot.log(`No need to rename: ${originalFileName}`);
    return;
  }
  robot.log(`Rename: ${originalFileName} -> ${newFileName}`);
  // create new file
  // https://developer.github.com/v3/repos/contents/#create-a-file
  const { data: createFileResponse } = await octokit.repos.createFile({
    owner,
    repo,
    path: newFileName,
    message: `Move ${originalFileName} to ${newFileName}`,
    content: getContentResponse.content,
    branch
  });
  robot.log("createFileResponse", createFileResponse);
  // remove original file
  const { data: deleteFileResponse } = await octokit.repos.deleteFile({
    owner,
    repo,
    path: originalFileName,
    message: `Remove ${originalFileName}`,
    sha: getContentResponse.sha,
    branch
  });
  robot.log("deleteFileResponse", deleteFileResponse);
  return {
    status: "ok"
  };
};

const RENAME_TARGET = /(_i18n\/ja\/_posts\/\d+)\/(.*?\.md$)/;
const canRename = originalFilePath => {
  return RENAME_TARGET.test(originalFilePath);
};
/**
 *
 * @param originalFilePath
 * @param content https://developer.github.com/v3/repos/contents/#get-contents
 * @returns {*}
 */
const renamePattern = (originalFilePath, content) => {
  if (!RENAME_TARGET.test(originalFilePath)) {
    return originalFilePath;
  }
  const titlePattern = /title: "(\d{4})-(\d{2})-(\d{2})のJS:(.*)"/;
  if (!titlePattern.test(content)) {
    return originalFilePath;
  }
  const [_, year, month, day, keyword] = content.match(titlePattern);
  const trimmedKeyword = keyword.trim();
  // Title is empty
  if (trimmedKeyword.length === 0) {
    return originalFilePath;
  }
  const newSlug = slug(trimmedKeyword, {
    remove: null,
    lower: true
  });
  const ext = path.extname(originalFilePath);
  return originalFilePath.replace(RENAME_TARGET, (all, pathname) => {
    return `${pathname}/${year}-${month}-${day}-${newSlug}${ext}`;
  });
};

module.exports = robot => {
  // Rename: post file name from post title
  robot.on("push", async context => {
    const push = context.payload;
    const compare = await context.github.repos.compareCommits(
        context.repo({
          base: push.before,
          head: push.after
        })
    );
    const branch = push.ref.replace("refs/heads/", "");
    const repoInfo = context.repo();
    const promises = compare.data.files
        .filter(file => {
          return file.status === "added" || file.status === "modified";
        })
        .filter(file => {
          const originalFileName = file.filename;
          return canRename(originalFileName);
        })
        .map(file => {
          return renameCommit(context, {
            owner: repoInfo.owner,
            repo: repoInfo.repo,
            ref: push.ref,
            branch,
            originalFileName: file.filename,
            renameFn: (fileName, content) => {
              return renamePattern(fileName, content);
            }
          });
        });
    return Promise.all(promises);
  });
};
