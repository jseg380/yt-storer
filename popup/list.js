// This script is now only responsible for DISPLAYING and DELETING videos.
document.addEventListener('DOMContentLoaded', () => {
  const videoList = document.getElementById('video-list');

  // Function to display all saved videos in the popup
  async function displayVideos() {
    videoList.innerHTML = '';
    const result = await browser.storage.local.get({ videos: [] });
    const videos = result.videos;

    if (videos.length === 0) {
      videoList.innerHTML = '<li>Right-click on a YouTube video and select "Store This Video" to add it.</li>';
      return;
    }

    // To show the newest videos first, we reverse the array before displaying.
    videos.reverse().forEach(video => {
      const listItem = document.createElement('li');
      
      const link = document.createElement('a');
      link.href = video.url;
      link.textContent = video.title;
      link.target = "_blank";
      
      const deleteButton = document.createElement('button');
      deleteButton.textContent = 'X';
      deleteButton.className = 'delete-btn';
      deleteButton.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent the link from being clicked when deleting
        deleteVideo(video.id);
      });
      
      listItem.appendChild(link);
      listItem.appendChild(deleteButton);
      // Make the whole list item clickable to open the video
      listItem.addEventListener('click', () => {
        browser.tabs.create({ url: video.url });
      });
      
      videoList.appendChild(listItem);
    });
  }
  
  // Function to delete a video by its ID
  async function deleteVideo(idToDelete) {
    const result = await browser.storage.local.get({ videos: [] });
    let videos = result.videos;
    videos = videos.filter(video => video.id !== idToDelete);
    await browser.storage.local.set({ videos });
    displayVideos(); // Refresh the list
  }

  // Display the videos as soon as the popup is opened
  displayVideos();
});
