registerCollection({
    "reload": false,
    "experimental": true,
    "url": "http://gw.geneanet.org",
    "prepareUrl": function(url) {
        if (url.contains("type=")) {
            url = url.replace(/&type=.*?&/, "&");
            url = url.replace(/&type=.*?$/, "");
            url = url.replace(/\?type=.*?&/, "?");
            this.reload = true;
        }
        if (url.contains("lang=") && !url.contains("lang=en")) {
            url = url.replace(/lang=.*?(?=&|$)/, "lang=en");
            this.reload = true;
        }
        return url;
    },
    "parseData": function(url) {
        focusURLid = getGeneanetItemId(url);
        getPageCode();
    },
    "loadPage": function(request) {
        var parsed = $(request.source.replace(/<img[^>]*>/ig, ""));
        var nameTab = parsed.find(".with_tabs.name");
        focusname = nameTab.find("a").first().text() + " " + nameTab.find("a").first().next().text();
        recordtype = "Geneanet Genealogy";
    },
    "parseProfileData": parseGeneanet
});

function parseGeneanet(htmlstring, familymembers, relation) {
  relation = relation || "";
  //var parsed = $(htmlstring.replace(/<img[^>]*>/ig,""));
  var parsed = $(htmlstring);

  var nameTab = parsed.find(".with_tabs.name")
  var genderval = "unknown";
  var genderImg = nameTab.find("img").first();
  if (genderImg.attr("title") === "M") {
    genderval = "male";
  } else if (genderImg.attr("title") === "F") {
    genderval = "female";
  } else if (exists(relation.gender) && relation.gender !== "unknown") {
    genderval = relation.gender;
  }
  if (relation === "") {
    focusgender = genderval;
  }

  givenName = nameTab.find("a").first().text();
  familyName = nameTab.find("a").first().next().text();
  focusperson = givenName + " " + familyName;
  // hack required?
  focusname = focusperson;
  document.getElementById("readstatus").innerHTML = escapeHtml(focusperson);

  var profiledata = {name: focusperson, gender: genderval, status: relation.title};

  fullBirth = parsed.find("ul li:contains('Born ')");
  if (exists(fullBirth)) {
    profiledata["birth"] = parseGeneanetDate(fullBirth.text().replace('Born ', ''));
  }

  fullBaptism = parsed.find("ul li:contains('Baptized ')");
  if (exists(fullBaptism)) {
    profiledata["baptism"] = parseGeneanetDate(fullBaptism.text().replace('Baptized ', ''));
  }

  fullDeath = parsed.find("ul li:contains('Deceased ')");
  if (exists(fullDeath)) {
    profiledata["death"] = parseGeneanetDate(fullDeath.text().replace('Deceased ', '').replace(/ at age .*/, '').replace(/ age at .*/, ''));
  }

  fullBurial = parsed.find("ul li:contains('Buried ')");
  if (exists(fullBurial)) {
    profiledata["burial"] = parseGeneanetDate(fullBurial.text().replace('Buried ', ''));
  }

  if (familymembers) {
    loadGeniData();
    var famid = 0;

    var parents = $(parsed).find('h2:has(span:contains("Parents")) + ul li');
    if (exists(parents[0])) {
      processGeneanetFamily(parents[0], "father", famid);
      famid++;
    }
    if (exists(parents[1])) {
      processGeneanetFamily(parents[1], "mother", famid);
      famid++;
    }

    var spouses = $(parsed).find('h2:has(span:contains("Spouses")) + ul.fiche_union > li');
    if (exists(spouses[0])) {
      for (var i = 0; i < spouses.length; i++) {
        var spouse = spouses[i];
        processGeneanetFamily(spouse, "spouse", famid);
        myhspouse.push(famid);
        famid++;

        var children = $(spouse).find("> ul > li");
        if (exists(children[0])) {
          for (var j = 0; j < children.length; j++) {
            processGeneanetFamily(children[j], "child", famid);
            famid++;
          }
        }
      }
    }

    var siblings = $(parsed).find('h2:has(span:contains("Siblings")) + ul li');
    siblings = siblings.filter(function(index) {
        if($(siblings[index]).find('b').length === 0){
            return true;
        }
    });
    if (exists(siblings[1])) {
        for (i=0; i<siblings.length; i++) {
            processGeneanetFamily(siblings[i], "sibling", famid);
            famid++;
        }
    }

  } else if (isParent(relation.title)) {
      if (parentmarriageid === "") {
          parentmarriageid = relation.itemId;
      } else if (relation.itemId !== parentmarriageid) {
          var spouses = $(parsed).find('h2:has(span:contains("Spouses")) + ul.fiche_union > li');
          for (i=0;i<spouses.length;i++) {
              var url = $(spouses[i]).find("a").attr("href");
              if (exists(url)) {
                  var itemid = getGeneanetItemId(url);
                  if (itemid === parentmarriageid) {
                      profiledata = processMarriage(spouses[i], profiledata);
                  }
              }
          }
      }
  } else if (isSibling(relation.title)) {
      var siblingparents = [];
      var parents = $(parsed).find('h2:has(span:contains("Parents")) + ul li');
      for (i=0;i<parents.length;i++) {
          var url = $(parent[i]).find("a").attr("href");
          if (exists(url)) {
              var itemid = getGeneanetItemId(url);
              siblingparents.push(itemid);
          }
      }
      if (siblingparents.length > 0) {
          profiledata["halfsibling"] = !recursiveCompare(parentlist, siblingparents);
      }
  } else if (isChild(relation.title)) {
      var parents = $(parsed).find('h2:has(span:contains("Parents")) + ul li');
      for (i=0;i<parents.length;i++) {
          var url = $(parent[i]).find("a").attr("href");
          if (exists(url)) {
              var itemid = getGeneanetItemId(url);
              if (focusURLid !== itemid) {
                  childlist[relation.proid] = $.inArray(itemid, unionurls);
                  profiledata["parent_id"] = $.inArray(itemid, unionurls);
                  break;
              }
          }
      }
  }


  if (familymembers) {
    alldata["profile"] = profiledata;
    alldata["scorefactors"] = smscorefactors;
    updateGeo();
  }

  return profiledata;
}

function parseGeneanetDate(vitalstring, type) {
  vitalstring = vitalstring.replace(/,$/, "").trim();
  // Example matches:
  // in 1675
  // about 1675
  // before 1675
  // after 1675
  // 30 September 1675 - Crouy sur Cosson, 41, France
  // 30 September 1675, Crouy sur Cosson, 41, France     // Marriage version
  // 30 September 1675 (Saturday) - Crouy sur Cosson, 41, France
  // before September 1675 - Crouy sur Cosson, 41, France
  var data;
  var matches;
  if (type === "marriage") {
    matches = vitalstring.match(/(about|before|after)?([\w\s]+\w)(?:\s+\(\w+\))?(?:,\s+(.+))?/i);
  } else {
    matches = vitalstring.match(/(about|before|after)?([\w\s]+\w)(?:\s+\(\w+\))?(?:\s+-\s+(.+))?/i);
  }
  if (exists(matches)) {
    data = [];
    var dateval = matches[2].trim();
    // Warning: nbsp; in date format!
    var nbspre = new RegExp(String.fromCharCode(160), "g");
    dateval = dateval.replace(nbspre, " ");
    // Parse stricly, and try harder if it fails
    var momentval;
    var date_format;
    if (dateval.startsWith("in ")) {
      momentval = moment(dateval.replace("in ", ""), "YYYY", true);
      date_format = "YYYY";
    } else {
      momentval = moment(dateval, "D MMMM YYYY", true);
      date_format = "MMM D YYYY";
      if (!momentval.isValid()) {
        momentval = moment(dateval, "MMMM YYYY", true);
        date_format = "MMM-YYYY";
      }
      if (!momentval.isValid()) {
        momentval = moment(dateval, "YYYY", true);
        date_format = "YYYY";
      }
    }
    if (momentval.isValid()) {
        momentdate = momentval.format(date_format);
        if (matches[1] !== undefined) {
          momentdate = matches[1]+" "+momentdate;
        }
        dateval = cleanDate(momentdate);
        data.push({date: dateval});
    }

    var eventlocation = matches[3];
    if (eventlocation) {
      eventlocation = eventlocation.trim().replace(/ ?,$/,"");
      if (eventlocation !== "") {
        data.push({id: geoid, location: eventlocation});
        geoid++;
      }
    }
  }
  return data;
}

function processGeneanetFamily(person, title, famid) {
  var url = $(person).find("a").first().attr("href");
  if (exists(url)) {
    if (!exists(alldata["family"][title])) {
      alldata["family"][title] = [];
    }

    var name = $(person).find("a").first().text();
    var itemid = getGeneanetItemId(url);
    if (isParent(title)) {
      parentlist.push(itemid);
    }
    var gendersv = "unknown";
    if (isFemale(title)) {
      gendersv = "female";
    } else if (isMale(title)) {
      gendersv = "male";
    } else if (isPartner(title)) {
      gendersv = reverseGender(focusgender);
    }
    var fullurl = "http://gw.geneanet.org/"+url;
    var subdata = {name: name, title: title, url: fullurl, gender: gendersv, itemId: itemid, profile_id: famid};

    // Parse marriage data
    subdata = processMarriage(person, subdata);
    unionurls[famid] = itemid;
    getGeneanetFamily(famid, fullurl, subdata);
  }
}

function processMarriage(person, subdata) {
    if ($(person).text().startsWith("Married")) {
        var marriageinfo = $(person).find("em").first();
        if (exists(marriageinfo)) {
            subdata["marriage"] = parseGeneanetDate(marriageinfo.text(), "marriage");
        }
    }
    return subdata;
}

function getGeneanetFamily(famid, url, subdata) {
    familystatus.push(famid);
    chrome.extension.sendMessage({
        method: "GET",
        action: "xhttp",
        variable: subdata,
        url: url
    }, function (response) {
        var arg = response.variable;
        var person = parseGeneanet(response.source, false, {"title": arg.title, "proid": arg.profile_id, "itemId": arg.itemId});
        if (person === "") {
            familystatus.pop();
            return;
        }
        person = updateInfoData(person, arg);
        databyid[arg.profile_id] = person;
        alldata["family"][arg.title].push(person);
        familystatus.pop();
    });
}

function getGeneanetItemId(url) {
    if (exists(url)) {
        var p = getParameterByName("p", url);
        var n = getParameterByName("n", url);
        var oc = getParameterByName("oc", url);
        return "p="+p+"&n="+n+"&oc="+oc;
    } else {
        return "";
    }
}