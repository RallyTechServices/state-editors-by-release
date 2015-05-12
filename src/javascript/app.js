Ext.define("state-editors-by-release", {
    extend: 'Rally.app.TimeboxScopedApp',
    scopeType: 'release',
    componentCls: 'app',
    logger: new Rally.technicalservices.Logger(),
    defaults: { margin: 10 },
    items: [
        {xtype: 'container', itemId: 'ct-header',cls: 'header', layout: {type: 'hbox'}},
        {xtype: 'container', itemId:'ct-display'},
        {xtype: 'tsinfolink'}

    ],
    onScopeChange: function(scope) {
        // render/refresh components
        this.logger.log('onScopeChange', scope);
        this._updateApp(scope.getRecord());
    },
    launch: function(){
        this.callParent();
        this._addComponents();
    },

    _addComponents: function(){
        if (this.getHeader()) {
            //Do nothing
        } else {
            this.add({xtype: 'container',itemId:'ct-header', cls: 'header', layout: {type: 'hbox'}});
            this.add({xtype: 'container',itemId:'ct-display'});
            this.add({xtype: 'tsinfolink'});
        }

    },
    _updateApp: function(releaseRecord){
        this.logger.log('_updateApp',releaseRecord);
        this._fetchData(releaseRecord);
    },
    _fetchData: function(release){
        var releases = [null],
            destinationState = "Accepted",
            releaseName = "Unscheduled";

        if (release){
            //We need to get all possible releases in scope, blech
            releases = [release.get('ObjectID')];
            releaseName = release.get('Name');
        }
        var store = Ext.create('Rally.data.lookback.SnapshotStore', {
            fetch: ['FormattedID','Name','_User','_PreviousValues.ScheduleState', "ScheduleState","_ValidFrom", "Iteration", "Project"],
            findConfig: {
                "Release": {$in: releases},
                "_TypeHierarchy": 'HierarchicalRequirement',
                "ScheduleState": destinationState,
                "_PreviousValues.ScheduleState": {$exists: true}
            },
            hydrate: ["Project","Iteration","_PreviousValues.ScheduleState","ScheduleState"]
        });
        store.load({
            scope: this,
            callback: function(records, operation, success){
                this.logger.log('load successful?', success, records, operation);
                if (success) {
                    this._aggregateSnapshots(records);
                } else {
                    var msg = Ext.String.format('Error loading snapshots for release {0} [{1}]',releaseName, operation.error.errors[0]);
                    Rally.ui.notify.Notifier.showError({message: msg});
                }
            }
        });
    },
    _buildGrid: function(config){
        this.logger.log('_buildGrid',config);

        var store = Ext.create('Rally.data.custom.Store', config);

        if (this.down('#rally-grid')){
            this.down('#rally-grid').destroy();
        }

        var grid = this.down('#ct-display').add({
            xtype: 'rallygrid',
            itemId: 'rally-grid',
            store: Ext.create('Rally.data.custom.Store', {
                data: config.data,
                autoLoad: true,
                remoteSort: false,
                remoteFilter: false,
                pageSize: config.pageSize,
                width: '75%'
            }),
            columnCfgs: [
                {dataIndex: 'FormattedID', text: 'FormattedID'},
                {dataIndex: 'Name', text: 'Name', flex: 1},
                {dataIndex: 'ChangedByOid', width: "20%", text: 'Accepted By', xtype: 'templatecolumn', tpl: '<tpl if="UserName">{FirstName} {LastName} ({UserName})</tpl>'},
                {dataIndex: 'DateChanged', text: 'Last Accepted Date', width: '20%',renderer: function(v){
                    if (v){
                        return Rally.util.DateTime.formatWithDefaultDateTime(Rally.util.DateTime.fromIsoString(v));
                    }
                    return '';

                }}

            ],
            showPagingToolbar: false
        });
    },

    _aggregateSnapshots: function(snapshots){

        var snaps_by_oid = {};
        if (snapshots){
            snaps_by_oid = this.aggregateSnapsByOidForModel(snapshots);
        }

        var data = [],
            fields = ['FormattedID','ObjectID',"Name","ChangedBy","DateChanged"],
            prevStateField = "_PreviousValues.ScheduleState",
            stateField = "ScheduleState",
            auditStateValue = "Accepted";


        var user_oids = [];
        _.each(snaps_by_oid, function(snaps, oid){
            var rec = {FormattedID: null, ObjectID: null, Name: null, ChangedByOid: null, DateChanged: null, snap: null};
            _.each(snaps, function(snap){
                rec.FormattedID = snap.FormattedID;
                rec.ObjectID = snap.ObjectID;
                rec.Name = snap.Name;
                if (snap[prevStateField] != snap[stateField] && snap[stateField] == auditStateValue){
                    if (snap._User && !Ext.Array.contains(user_oids, snap._User)){
                        user_oids.push(snap._User);
                    }
                    console.log('state stuff', snap.FormattedID, snap[prevStateField], snap[stateField] , snap[stateField] == auditStateValue)
                    rec.ChangedByOid = snap._User;
                    rec.DateChanged = snap._ValidFrom
                }
                rec.snap = snap;
            });
            data.push(rec);
        });

        var config = {};
        config["data"] = data;
        config["pageSize"] = data.length;

        this._hydrateUsers(config, user_oids);
    },
    _hydrateUsers: function(config, users){
        this.logger.log('_hydrateUsers',users);
        this._fetchUsers(users).then({
            scope: this,
            success: function(records){
                var userHash = {};
                _.each(records, function(r){
                    userHash[r.get('ObjectID')] = {
                        UserName: r.get('UserName') || '',
                        FirstName: r.get('FirstName') || '',
                        LastName: r.get('LastName') || '',
                        ObjectID: r.get('ObjectID')
                    };
                });

                _.each(config.data, function(rec){
                    var oid = rec["ChangedByOid"] || 0;

                    rec["UserName"] = (userHash[oid] ? userHash[oid].UserName || '' : '');
                    rec["FirstName"] = (userHash[oid] ? userHash[oid].FirstName || '' : '');
                    rec["LastName"] = (userHash[oid] ? userHash[oid].LastName || '' : '');
                });

                this._buildGrid(config);

            },
            failure: function(errorMsg){

            }
        });
    },
    _fetchUsers: function(users){
        var deferred = Ext.create('Deft.Deferred');

        var minObjectID = Ext.Array.min(users),
            maxObjectID = Ext.Array.max(users),
            filters = [];

        filters.push({
            property: 'ObjectID',
            operator: '>=',
            value: minObjectID
        });
        filters.push({
            property: 'ObjectID',
            operator: '<=',
            value: maxObjectID
        });

        filters = Rally.data.wsapi.Filter.and(filters);

        var user_store = Ext.create('Rally.data.wsapi.Store',{
            model: 'User',
            fetch: ['UserName','FirstName','LastName','ObjectID'],
            filters: filters
        });
        user_store.load({
            scope: this,
            callback: function(records, operation, success){
                if (success) {
                    deferred.resolve(records);
                } else {
                    deferred.reject("Error hydrating users:  " + operations.error.errors[0]);
                }
            }
        });
        return deferred;
    },
    aggregateSnapsByOidForModel: function(snaps){
        //Return a hash of objects (key=ObjectID) with all snapshots for the object
        var snaps_by_oid = {};
        Ext.each(snaps, function(snap){
            var oid = snap.ObjectID || snap.get('ObjectID');
            if (snaps_by_oid[oid] == undefined){
                snaps_by_oid[oid] = [];
            }
            snaps_by_oid[oid].push(snap.getData());
        });
        return snaps_by_oid;
    }
});
