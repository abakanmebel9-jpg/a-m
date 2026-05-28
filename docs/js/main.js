(function() {
  'use strict';
  var savedTheme = localStorage.getItem('theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);
  var themeToggle = document.getElementById('themeToggle');
  if (themeToggle) {
    themeToggle.addEventListener('click', function() {
      var current = document.documentElement.getAttribute('data-theme');
      var next = current === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('theme', next);
    });
  }
  window.addEventListener('scroll', function() {
    var header = document.getElementById('header');
    var scrollProgress = document.getElementById('scrollProgress');
    var scrollToTop = document.getElementById('scrollToTop');
    if (window.scrollY > 50) { if (header) header.classList.add('scrolled'); }
    else { if (header) header.classList.remove('scrolled'); }
    var winScroll = document.body.scrollTop || document.documentElement.scrollTop;
    var height = document.documentElement.scrollHeight - document.documentElement.clientHeight;
    var scrolled = (winScroll / height) * 100;
    if (scrollProgress) scrollProgress.style.width = scrolled + '%';
    if (scrollToTop) {
      if (window.scrollY > 500) scrollToTop.classList.add('visible');
      else scrollToTop.classList.remove('visible');
    }
  });
  var scrollToTopBtn = document.getElementById('scrollToTop');
  if (scrollToTopBtn) {
    scrollToTopBtn.addEventListener('click', function() { window.scrollTo({ top: 0, behavior: 'smooth' }); });
  }
  // Video thumbnail click
  document.addEventListener('click', function(e) {
    var thumb = e.target.closest('.video-thumbnail');
    if (thumb) {
      var videoSrc = thumb.dataset.videoSrc;
      if (videoSrc) {
        var container = thumb.parentElement;
        container.innerHTML = '<video src="' + videoSrc + '" controls autoplay playsinline style="width:100%;max-height:600px"></video>';
      }
    }
  });

  window.initAbakanMebel = function(matrixKeywords) {
    var canvas = document.getElementById('matrix-bg');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    var columns = Math.floor(canvas.width / 20);
    var drops = [];
    for (var i = 0; i < columns; i++) drops[i] = 1;
    function draw() {
      ctx.fillStyle = 'rgba(15, 23, 42, 0.05)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      for (var i = 0; i < drops.length; i++) {
        var text = matrixKeywords[Math.floor(Math.random() * matrixKeywords.length)];
        var x = i * 20;
        var y = drops[i] * 20;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.font = '12px monospace';
        ctx.fillText(text, x, y);
        if (y > canvas.height && Math.random() > 0.975) drops[i] = 0;
        drops[i]++;
      }
    }
    setInterval(draw, 120);
    window.addEventListener('resize', function() {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      columns = Math.floor(canvas.width / 20);
      drops = [];
      for (var i = 0; i < columns; i++) drops[i] = 1;
    });
  };

  // Load More functionality
  var loadMoreBtn = document.getElementById('loadMoreBtn');
  if (loadMoreBtn) {
    var currentPage = parseInt(loadMoreBtn.dataset.page, 10) || 2;
    var isLoading = false;
    var lang = loadMoreBtn.dataset.lang || 'ru';
    var totalPosts = parseInt(loadMoreBtn.dataset.total, 10) || 0;
    var loadMoreTag = loadMoreBtn.dataset.tag || '';
    var postsFeed = document.getElementById('postsFeed');
    var allPostsData = null;

    loadMoreBtn.addEventListener('click', async function() {
      if (isLoading) return;
      isLoading = true;
      loadMoreBtn.classList.add('loading');
      loadMoreBtn.disabled = true;
      try {
        if (!allPostsData) {
          var response = await fetch('/data/posts.json');
          if (!response.ok) throw new Error('Failed to load posts');
          allPostsData = await response.json();
        }
        var filtered = loadMoreTag ? allPostsData.filter(function(p) {
          return p.hashtags && p.hashtags.some(function(h) { return h.replace(/^#+/, '').toLowerCase() === decodeURIComponent(loadMoreTag).toLowerCase(); });
        }) : allPostsData;
        var perPage = 30;
        var start = (currentPage - 1) * perPage;
        var end = start + perPage;
        var pagePosts = filtered.slice(start, end);
        if (pagePosts.length === 0) {
          loadMoreBtn.style.display = 'none';
          return;
        }
        pagePosts.forEach(function(post) {
          var article = document.createElement('article');
          article.className = 'post-feed-item';
          article.setAttribute('data-post-id', post.id);
          var mediaHTML = '';
          if (post.hasMedia && post.media && post.media.length > 0) {
            var m = post.media[0];
            mediaHTML = '<div class="post-feed-media"><div class="post-feed-media-item">';
            if (m.type === 'instagram') {
              var igText = lang === 'ru' ? 'Смотреть в Instagram' : 'View on Instagram';
              mediaHTML += '<a href="' + m.directUrl + '" target="_blank" rel="noopener" class="instagram-embed__link"><div class="instagram-embed__placeholder instagram-embed__placeholder--card"><span class="instagram-embed__text">' + igText + '</span></div></a>';
            } else if (m.type === 'video') {
              mediaHTML += '<div class="video-container"><div class="video-thumbnail" data-video-src="/m/' + hashStr(m.directUrl) + '"><img src="/m/' + hashStr(m.poster || 'https://i.pinimg.com/736x/99/d6/71/99d67109954a1bc4102f2142a82d2de7.jpg') + '" alt="' + post.title + '" loading="lazy"></div></div>';
            } else {
              mediaHTML += '<img src="/m/' + hashStr(m.directUrl) + '" alt="' + post.title + '" loading="lazy">';
            }
            mediaHTML += '</div></div>';
          }
          var dateObj = new Date(post.date);
          var dateStr = dateObj.toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric' });
          var postUrl = lang === 'ru' ? post.postUrl : post.postUrlEn;
          var btnRead = lang === 'ru' ? 'Читать' : 'Read';
          article.innerHTML = mediaHTML +
            '<div class="post-feed-content">' +
            '<div class="post-feed-meta"><span>' + dateStr + '</span></div>' +
            '<h3 class="post-feed-title"><a href="' + postUrl + '">' + post.title + '</a></h3>' +
            '<div class="post-feed-actions"><a href="' + postUrl + '" class="btn btn-read">' + btnRead + '</a></div></div>';
          postsFeed.appendChild(article);
        });
        currentPage++;
        if (end >= filtered.length) loadMoreBtn.style.display = 'none';
      } catch (error) {
        console.error('Load more error:', error);
      } finally {
        isLoading = false;
        loadMoreBtn.classList.remove('loading');
        loadMoreBtn.disabled = false;
      }
    });
  }

  function hashStr(str) {
    if (!str) return '0';
    var hash = 2166136261;
    for (var i = 0; i < str.length; i++) { hash ^= str.charCodeAt(i); hash = (hash * 16777619) >>> 0; }
    return hash.toString(36);
  }
})();