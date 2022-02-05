import async from "async";
import hash from "sha512crypt-node";
import fs from "fs-extra";
import crypt from "apache-crypt";
import passwd from "etc-passwd";
import posix from "posix";
import userid from "userid";

const pam = require('authenticate-pam')
let auth: any = {};

auth.authenticate_shadow = function(user, plaintext, callback) {


  function etc_shadow(inner_callback) {
    // return true if error, false if auth failed, string for user if successful
    fs.stat('/etc/shadow', function(err, stat_info) {
      if (err) {
        console.log("fs stat threw err: ", err);
        inner_callback(true);
      } else {
        passwd.getShadow({username: user}, function(err, shadow_info) {
          if (shadow_info && shadow_info.password == '!') {
            console.log("getShadow did not contain password!")
            inner_callback(false);
          } else if (shadow_info) {
            console.log("getShadow got info")
            const password_parts = shadow_info['password'].split(/\$/);
            const salt = password_parts[2];
            const new_hash = hash.sha512crypt(plaintext, salt);

            const passed = (new_hash == shadow_info['password'] ? user : false);
            inner_callback(passed);
          } else {
            console.log("getShadow threw err: ", err)
            inner_callback(true);
          }
        })
      }
    })
  }

  function posixf(inner_callback) {
    // return true if error, false if auth failed, string for user if successful
    try {
      const user_data = posix.getpwnam(user);
      if (crypt(plaintext, user_data.passwd) == user_data.passwd)
        inner_callback(user);
      else if (user_data) {
        // the crypt hash method fails on FreeNAS so try the sha512
        const password_parts = user_data.passwd.split(/\$/);
        const salt = password_parts[2];
        const new_hash = hash.sha512crypt(plaintext, salt);
        const passed = (new_hash == user_data.passwd ? user : false);
        inner_callback(passed);
      } else {
        console.log("could not authenticate with posix")
        inner_callback(false);
      }
    } catch (e) {
      console.log("posix failed with err: ", e)
      inner_callback(true);
      return;
    }
  }

  function pamf(inner_callback) {
    pam.authenticate(user, plaintext, function(err) {
      if (err) {
        console.log("pam failed with err: ", err)
        inner_callback(false);
      } else {
        inner_callback(user);
      }
    })
  }

  console.log("authenticating.. ")
  pamf(function(pam_passed) {
    //due to the stack of different auths, a false if auth failed is largely ignored
    if (typeof pam_passed == 'string') {
      console.log("pam passsed")
      callback(pam_passed);
    } else {
      console.log("pam failed")
      etc_shadow(function (etc_passed) {
        if (typeof etc_passed == 'string') {
          console.log("shadow passed")
          callback(etc_passed)
        } else {
          console.log("shadow failed")
          posixf(function (posix_passed) {
            if (typeof posix_passed == 'string') {
              console.log("posix passed")
              callback(posix_passed)
            } else {
              console.log("could not authenticate")
              callback(false);
            }
          })
        }
      })
    }
  })
}

auth.test_membership = function(username, group, callback) {
  let membership_valid = false;
  const gg = passwd.getGroups()
      .on('group', function (group_data) {
        if (group == group_data.groupname)
          try {
            if (group_data.users.indexOf(username) >= 0 || group_data.gid == userid.gids(username)[0])
              membership_valid = true;
          } catch (e) {
          }
      })
      .on('end', function () {
        callback(membership_valid);
      });
}

auth.verify_ids = function(uid, gid, callback) {
  let uid_present = false;
  let gid_present = false;

  async.series([
    function(cb) {
      const gg = passwd.getUsers()
          .on('user', function (user_data) {
            if (user_data.uid == uid)
              uid_present = true;
          })
          .on('end', function () {
            if (!uid_present)
              cb(new Error('UID ' + uid + ' does not exist on this system'));
            else
              cb();
          });
    },
    function(cb) {
      const gg = passwd.getGroups()
          .on('group', function (group_data) {
            if (group_data.gid == gid)
              gid_present = true;
          })
          .on('end', function () {
            if (!gid_present)
              cb(new Error('GID ' + gid + ' does not exist on this system'));
            else
              cb();
          });
    }
  ], callback)
}

export default auth;