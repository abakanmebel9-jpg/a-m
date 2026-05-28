(function() {
      'use strict';
      var savedTheme = localStorage.getItem('theme') || '${CONFIG.DEFAULT_THEME}';
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
        if (window.scrollY > 50) {
          if (header) header.classList.add('scrolled');
        } else {
          if (header) header.classList.remove('scrolled');
        }
        var winScroll = document.body.scrollTop || document.documentElement.scrollTop;
        var height = document.documentElement.scrollHeight - document.documentElement.clientHeight;
        var scrolled = (winScroll / height) * 100;
        if (scrollProgress) scrollProgress.style.width = scrolled + '%';
        if (scrollToTop) {
          if (window.scrollY > 500) {
            scrollToTop.classList.add('visible');
          } else {
            scrollToTop.classList.remove('visible');
          }
        }
      });
      var scrollToTopBtn = document.getElementById('scrollToTop');
      if (scrollToTopBtn) {
        scrollToTopBtn.addEventListener('click', function() {
          window.scrollTo({ top: 0, behavior: 'smooth' });
        });
      }
      var loadMoreBtn = document.getElementById('loadMoreBtn');
      if (loadMoreBtn) {
        var currentPage = parseInt(loadMoreBtn.dataset.page, 10) || 2;
        var isLoading = false;
        var lang = loadMoreBtn.dataset.lang || 'ru';
        var totalPosts = parseInt(loadMoreBtn.dataset.total, 10) || 0;
        var loadMoreTag = loadMoreBtn.dataset.tag || '';
        var postsFeed = document.getElementById('postsFeed');
        var counter = document.querySelector('.posts-counter');
        loadMoreBtn.addEventListener('click', async function() {
          if (isLoading) return;
          isLoading = true;
          loadMoreBtn.classList.add('loading');
          loadMoreBtn.disabled = true;
          try {
            var fetchUrl = '/api/posts/page?page=' + currentPage;
            if (loadMoreTag) fetchUrl += '&tag=' + loadMoreTag;
            var response = await fetch(fetchUrl);
            if (!response.ok) throw new Error('HTTP ' + response.status);
            var data = await response.json();
            if (!data.success || !Array.isArray(data.posts)) throw new Error('Invalid response');
            if (data.posts.length === 0) {
              loadMoreBtn.style.display = 'none';
              return;
            }
            var fragment = document.createDocumentFragment();
            data.posts.forEach(function(post) {
              var article = document.createElement('article');
              article.className = 'post-feed-item';
              article.setAttribute('data-post-id', post.id);
              var mediaHTML = '';
              if (post.hasMedia && post.media && post.media.length > 0) {
                var m = post.media[0];
                mediaHTML = '<div class="post-feed-media"><div class="post-feed-media-item">';
                if (m.type === 'instagram') {
                  // v83: Instagram embed in feed card (client-side)
                  var igText = lang === 'ru' ? 'Смотреть в Instagram' : 'View on Instagram';
                  mediaHTML += '<a href="' + m.directUrl + '" target="_blank" rel="noopener" class="instagram-embed__link">' +
                    '<div class="instagram-embed__placeholder instagram-embed__placeholder--card">' +
                    '<svg class="instagram-embed__icon" viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="5"/><circle cx="17.5" cy="6.5" r="1.5" fill="currentColor" stroke="none"/></svg>' +
                    '<span class="instagram-embed__text">' + igText + '</span>' +
                    '</div></a>';
                } else if (m.type === 'video') {
                  var proxyUrl = '/m/' + (function(str) {
                    if (!str) return '0';
                    var hash = 2166136261;
                    for (var i = 0; i < str.length; i++) { hash ^= str.charCodeAt(i); hash = (hash * 16777619) >>> 0; }
                    return hash.toString(36);
                  })(m.directUrl);
                  var posterUrl = '/m/' + (function(str) {
                    if (!str) return '0';
                    var hash = 2166136261;
                    for (var i = 0; i < str.length; i++) { hash ^= str.charCodeAt(i); hash = (hash * 16777619) >>> 0; }
                    return hash.toString(36);
                  })(post.media[0].poster || '${CONFIG.LOGO_URL}');
                  mediaHTML += '<div class="video-container"><div class="video-thumbnail" data-video-src="' + proxyUrl + '"><img src="' + posterUrl + '" alt="' + post.title + '" loading="lazy"></div></div>';
                } else {
                  var proxyUrl = '/m/' + (function(str) {
                    if (!str) return '0';
                    var hash = 2166136261;
                    for (var i = 0; i < str.length; i++) { hash ^= str.charCodeAt(i); hash = (hash * 16777619) >>> 0; }
                    return hash.toString(36);
                  })(m.directUrl);
                  mediaHTML += '<img src="' + proxyUrl + '" alt="' + post.title + '" loading="lazy">';
                }
                mediaHTML += '</div></div>';
              }
              var dateObj = new Date(post.date);
              var dateStr = dateObj.toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'en-US', {
                year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
              });
              var textToDisplay = post.textWithHashtags || post.text || '';
              // FIXED v79.1: Client-side formatting with URL placeholders
              var urlPlaceholders = [];
              var formattedText = textToDisplay
                .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;')
                .replace(/\\n/g, '<br>');
              formattedText = formattedText.replace(/(https?:\\/\\/[^\\s<]+)/g, function(match) {
                urlPlaceholders.push(match);
                return '%%URL_' + (urlPlaceholders.length - 1) + '%%';
              });
              formattedText = formattedText.replace(/#([\\p{L}\\p{N}_]+)/gu, function(match, hashtag) {
                var tagUrl = '/' + (lang === 'en' ? 'en/' : '') + 'tag/' + encodeURIComponent(hashtag);
                return '<a href="' + tagUrl + '" class="hashtag" data-hashtag="' + hashtag + '">#' + hashtag + '</a>';
              });
              formattedText = formattedText.replace(/@(\\w+)/g, '<span class="mention">@$1</span>');
              formattedText = formattedText.replace(/%%URL_(\\d+)%%/g, function(match, idx) {
                var url = urlPlaceholders[parseInt(idx, 10)];
                return url ? '<a href="' + url + '" target="_blank" rel="noopener">' + url + '</a>' : match;
              });
              var postUrl = lang === 'ru' ? post.postUrl : post.postUrlEn;
              var ampUrl = lang === 'ru' ? post.ampUrl : post.ampUrlEn;
              var btnRead = lang === 'ru' ? 'Читать' : 'Read';
              article.innerHTML = mediaHTML +
                '<div class="post-feed-content">' +
                '<div class="post-feed-meta"><span>📅 ' + dateStr + '</span><a href="' + ampUrl + '" class="amp-badge">AMP</a></div>' +
                '<h3 class="post-feed-title"><a href="' + postUrl + '">' + post.title + '</a></h3>' +
                '<div class="post-feed-text">' + formattedText + '</div>' +
                '<div class="post-feed-actions">' +
                '<a href="' + postUrl + '" class="btn btn-read">' + btnRead + '</a>' +
                '<a href="' + post.telegramLink + '" target="_blank" rel="noopener" class="btn btn-telegram">Telegram</a>' +
                '</div></div>';
              fragment.appendChild(article);
            });
            postsFeed.appendChild(fragment);
            var loadedCount = postsFeed.querySelectorAll('.post-feed-item').length;
            var shown = Math.min(loadedCount, data.total);
            if (counter) {
              counter.textContent = lang === 'ru'
                ? 'Показано ' + shown + ' из ' + data.total
                : 'Showing ' + shown + ' of ' + data.total;
            }
            if (!data.hasMore || shown >= data.total) {
              loadMoreBtn.style.display = 'none';
            } else {
              currentPage++;
              loadMoreBtn.dataset.page = currentPage;
              loadMoreBtn.classList.remove('loading');
              loadMoreBtn.disabled = false;
            }
          } catch (error) {
            console.error('[LoadMore] Error:', error);
            loadMoreBtn.classList.remove('loading');
            loadMoreBtn.disabled = false;
          } finally {
            isLoading = false;
          }
        });
      }
      document.addEventListener('click', function(e) {
        var thumbnail = e.target.closest('.video-thumbnail');
        if (thumbnail) {
          var videoSrc = thumbnail.dataset.videoSrc;
          if (videoSrc) {
            var videoContainer = thumbnail.closest('.video-container');
            if (videoContainer) {
              videoContainer.innerHTML = '<video controls autoplay style="width:100%;height:auto;max-height:600px;"><source src="' + videoSrc + '" type="video/mp4"></video>';
            }
          }
        }
      });
      var canvas = document.getElementById('matrix-bg');
      if (canvas) {
        var ctx = canvas.getContext('2d');
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        var keywords = ${JSON.stringify(CONFIG.NEWS_KEYWORDS.slice(0, 50).map(k => '#' + k))};
        var columns = Math.floor(canvas.width / 20);
        var drops = [];
        for (var i = 0; i < columns; i++) drops[i] = 1;
        function draw() {
          ctx.fillStyle = 'rgba(15, 23, 42, 0.12)';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          for (var i = 0; i < drops.length; i++) {
            var text = keywords[Math.floor(Math.random() * keywords.length)];
            var rand = Math.random();
            var isSuperFlash = rand > 0.98;
            var isFlash = rand > 0.90;
            var isSparkle = rand > 0.80;
            var x = i * 20;
            var y = drops[i] * 20;
            if (isSuperFlash) {
              ctx.shadowBlur = 40;
              ctx.shadowColor = '#FFFFFF';
              ctx.fillStyle = '#FFFFFF';
              ctx.font = 'bold 18px monospace';
              ctx.fillText(text, x, y);
              ctx.shadowBlur = 60;
              ctx.shadowColor = '#8b5cf6';
              ctx.fillText(text, x, y);
            } else if (isFlash) {
              ctx.shadowBlur = 30;
              ctx.shadowColor = '#FFFFFF';
              ctx.fillStyle = '#FFFFFF';
              ctx.font = 'bold 16px monospace';
              ctx.fillText(text, x, y);
            } else if (isSparkle) {
              ctx.shadowBlur = 20;
              ctx.shadowColor = '#6366f1';
              ctx.fillStyle = '#E6F3FF';
              ctx.font = '13px monospace';
              ctx.fillText(text, x, y);
            } else {
              ctx.shadowBlur = 0;
              ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
              ctx.font = '12px monospace';
              ctx.fillText(text, x, y);
            }
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
      }
    })();